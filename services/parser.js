
// services/parser.js

export function parseGeminiLine(line) {
    try {
        // Strip anti-hijacking prefix if present
        const cleanLine = line.replace(/^\)\]\}'/, '').trim();
        if (!cleanLine) return null;

        const rawData = JSON.parse(cleanLine);
        
        // The response should be an array (envelope)
        const rootArray = Array.isArray(rawData) ? rawData : null;
        if (!rootArray) return null;

        // Helper to extract conversation title from metadata line
        // Format: [["wrb.fr",null,"[null,[conversationId,responseId],{\"11\":[\"title\"],\"44\":true}]"]]
        const extractTitle = (item) => {
            if (!Array.isArray(item) || item.length < 3) return null;
            if (item[0] !== 'wrb.fr') return null;
            
            const payloadStr = item[2];
            if (typeof payloadStr !== 'string') return null;
            
            try {
                const payload = JSON.parse(payloadStr);
                if (!Array.isArray(payload) || payload.length < 3) return null;
                
                // payload[2] contains metadata object with field 11 for title
                const metadata = payload[2];
                if (metadata && typeof metadata === 'object' && metadata['11']) {
                    const titleArray = metadata['11'];
                    if (Array.isArray(titleArray) && titleArray[0]) {
                        return { title: titleArray[0] };
                    }
                }
            } catch(e) {
                return null;
            }
            return null;
        };

        // Helper to validate and extract from a potential payload item
        // Expected structure: [id, index, json_string, ...]
        const extractPayload = (item) => {
             if (!Array.isArray(item) || item.length < 3) return null;
             
             // The payload is typically a JSON string at index 2
             const payloadStr = item[2];
             if (typeof payloadStr !== 'string') return null;
             
             try {
                 const payload = JSON.parse(payloadStr);
                 
                 // Payload structure typically: 
                 // [ [conv_id, resp_id], ..., null, null, [ [candidates] ] ]
                 // We look for payload[4][0] -> first candidate
                 if (!Array.isArray(payload) || payload.length < 5) return null;
                 
                 const candidates = payload[4];
                 if (!Array.isArray(candidates) || !candidates[0]) return null;
                 
                 // Candidate structure: [choiceId, [text_node], ...]
                 const firstCandidate = candidates[0];
                 if (!Array.isArray(firstCandidate) || firstCandidate.length < 2) return null;

                 // 1. Extract Text
                 let text = "";
                 const textNode = firstCandidate[1];
                 if (Array.isArray(textNode) && typeof textNode[0] === 'string') {
                     text = textNode[0];
                 }

                 // 2. Extract Thoughts (Thinking Process) - Index 37
                 // Based on python gemini-webapi reference: candidate[37][0][0]
                 let thoughts = null;
                 if (firstCandidate[37] && Array.isArray(firstCandidate[37]) && firstCandidate[37][0]) {
                     const thoughtNode = firstCandidate[37][0];
                     if (Array.isArray(thoughtNode) && typeof thoughtNode[0] === 'string') {
                         thoughts = thoughtNode[0];
                     }
                 }

                 // 3. Extract Generated Images (Deep Search Strategy)
                 // Instead of relying on specific indices (which shift between models like Flash vs Thinking),
                 // we recursively scan the candidate structure for any string that looks like a hosted image URL.
                 const generatedImages = [];
                 const seenUrls = new Set();

                 const traverse = (obj, depth = 0) => {
                     // Safety break for deep recursion
                     if (!obj || depth > 20) return;

                     if (typeof obj === 'string') {
                         // Check for Google hosted content URLs (lh3.googleusercontent.com, etc.)
                         if ((obj.startsWith('http') || obj.startsWith('//')) && 
                             (obj.includes('googleusercontent.com') || obj.includes('ggpht.com'))) {
                             
                             // CRITICAL: Exclude placeholder URLs
                             // - image_generation_content: Standard placeholder
                             // - youtube_content: YouTube summary placeholder
                             // - Most placeholders end with /0
                             if (obj.includes('image_generation_content') ||
                                 obj.includes('youtube_content') ||
                                 obj.match(/\/\d+$/)) {  // Ends with /number (e.g., /0, /1)
                                 return;
                             }

                             // Normalize protocol
                             let url = obj;
                             if (url.startsWith('//')) {
                                 url = 'https:' + url;
                             } else if (url.startsWith('http://')) {
                                 url = url.replace('http://', 'https://');
                             }
                             
                             // Add unique images
                             if (!seenUrls.has(url)) {
                                 seenUrls.add(url);
                                 generatedImages.push({
                                     url: url,
                                     alt: "Generated Image"
                                 });
                             }
                         }
                         return;
                     }

                     if (Array.isArray(obj)) {
                         for (const item of obj) {
                             traverse(item, depth + 1);
                         }
                         return;
                     }

                     if (typeof obj === 'object') {
                         for (const key in obj) {
                             traverse(obj[key], depth + 1);
                         }
                         return;
                     }
                 };

                 // Start traversal on all properties of the candidate except the text node (index 1)
                 // This prevents us from re-parsing URLs quoted in the text itself.
                 firstCandidate.forEach((part, idx) => {
                     if (idx !== 1) traverse(part);
                 });

                 // CLEANUP: Always remove placeholder URLs from text (even if no real images found)
                 // Placeholder formats:
                 // - http://googleusercontent.com/image_generation_content/0
                 // - http://googleusercontent.com/youtube_content/0
                 text = text.replace(/https?:\/\/googleusercontent\.com\/(image_generation_content|youtube_content)\/\d+/g, '');
                 // Remove potential empty markdown links created by this removal
                 text = text.replace(/\[\s*\]\(\s*\)/g, '');
                 text = text.trim();

                 return {
                     text: text,
                     thoughts: thoughts,
                     images: generatedImages,
                     conversationId: payload[1]?.[0],
                     responseId: payload[1]?.[1],
                     choiceId: firstCandidate[0]
                 };
             } catch(e) { 
                 return null; 
             }
        };

        // Iterate through all items in the envelope to find the one containing the chat payload
        // This handles cases where the 'wrb.fr' ID changes, moves, or the item index shifts
        for (const item of rootArray) {
            // Check for title metadata first
            const titleResult = extractTitle(item);
            if (titleResult) {
                return { title: titleResult.title };
            }
            
            // Then check for regular chat payload
            const result = extractPayload(item);
            if (result) {
                return {
                    text: result.text,
                    thoughts: result.thoughts,
                    images: result.images,
                    ids: [result.conversationId, result.responseId, result.choiceId]
                };
            }
        }

    } catch (e) {
        // Line parsing failed (not JSON or unexpected format)
    }
    return null;
}
