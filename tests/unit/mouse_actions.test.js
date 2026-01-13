// tests/unit/mouse_actions.test.js
import { strict as assert } from 'assert';
import { MouseActions } from '../../background/control/actions/input/mouse.js';

// --- Mocks ---

class MockConnection {
    constructor() {
        this.commands = [];
        this.responses = new Map();
        this.attached = true;
    }

    async sendCommand(method, params) {
        this.commands.push({ method, params });
        
        // Return preset response or default
        if (this.responses.has(method)) {
            const response = this.responses.get(method);
            if (typeof response === 'function') return response(params);
            return response;
        }

        // Defaults
        if (method === 'DOM.getBoxModel') {
            return { model: { content: [0,0, 10,0, 10,10, 0,10] } }; // 10x10 box
        }
        if (method === 'Runtime.callFunctionOn') {
            // Default to visible (value=true) but NOT disabled (value=false for disable check)
            // But the method is generic. Let's return false by default for "disabled" check.
            // The code uses different scripts.
            // Visible check: rect.width > 0 -> returns true.
            // Disabled check: this.disabled === true -> returns false (enabled).
            
            // Simple mock strategy: 
            // If functionDeclaration contains "getBoundingClientRect", return true (visible)
            // If functionDeclaration contains "disabled", return false (enabled)
            return { result: { value: false } }; 
        }
        
        return {};
    }

    onDetach() {}
    waitForNewTab() { return Promise.resolve({ id: 123 }); }
    switchToTab() {}
}

class MockSnapshotManager {
    getBackendNodeId(uid) { return 100; }
    takeSnapshot() { return "<html>...</html>"; }
}

class MockWaitHelper {
    constructor(connection) { this.connection = connection; }
    async execute(fn) { await fn(); }
    async waitForCondition(options) { 
        // Simulate condition check passing immediately
        return true; 
    }
}

class MockOverlay {
    async highlightElement() {}
    async clearHighlights() {}
    async updateStatus() {}
}

// --- Tests ---

async function testMouseActions() {
    console.log('Testing MouseActions...');

    const connection = new MockConnection();
    const snapshotManager = new MockSnapshotManager();
    const waitHelper = new MockWaitHelper(connection);
    const overlay = new MockOverlay();
    
    const mouse = new MouseActions(connection, snapshotManager, waitHelper, overlay);

    // Mock getObjectIdFromUid (BaseActionHandler method)
    mouse.getObjectIdFromUid = async () => "object-1";

    // Test 1: Normal Click with Pre-checks
    console.log('Test 1: Normal Click with Pre-checks');
    await mouse.clickElement({ uid: 'test-uid' });
    
    // Verify sequence: Pre-checks -> Scroll -> BoxModel -> Dispatch Events
    const cmdMethods = connection.commands.map(c => c.method);
    
    // Should verify visibility/disabled status first (Runtime.callFunctionOn)
    assert.ok(cmdMethods.includes('Runtime.callFunctionOn'), 'Should perform pre-checks');
    assert.ok(cmdMethods.includes('DOM.scrollIntoViewIfNeeded'), 'Should scroll');
    assert.ok(cmdMethods.includes('Input.dispatchMouseEvent'), 'Should dispatch events');
    console.log('✓ Normal click flow correct');

    // Test 2: Click with Retry & JS Fallback
    console.log('Test 2: Click Retry & JS Fallback');
    connection.commands = []; // Reset logic
    
    // Force physical click to fail
    connection.responses.set('Input.dispatchMouseEvent', () => {
        throw new Error('Intercepted');
    });

    try {
        await mouse.clickElement({ 
            uid: 'fail-uid', 
            retryOptions: { maxRetries: 2, retryDelay: 10 } 
        });
    } catch (e) {
        // It might succeed via fallback, so we check return value or logs
        // But wait, jsClickFallback also uses connection commands.
    }

    // Verify retries
    const dispatchCount = connection.commands.filter(c => c.method === 'Input.dispatchMouseEvent').length;
    // We expect 1 call per attempt (because it fails immediately) -> 2 attempts -> 2 calls
    // If it didn't fail immediately, it would be 6 calls.
    assert.ok(dispatchCount >= 2, `Should retry physical clicks (count: ${dispatchCount})`);
    
    // Verify JS fallback was attempted (Runtime.callFunctionOn with specific script)
    const jsFallbackCall = connection.commands.find(c => 
        c.method === 'Runtime.callFunctionOn' && 
        c.params.functionDeclaration.includes('this.click()')
    );
    assert.ok(jsFallbackCall, 'Should attempt JS fallback');
    console.log('✓ Retry & Fallback flow correct');

    // Test 3: New Tab Handling
    console.log('Test 3: New Tab Handling');
    connection.commands = [];
    
    // Mock target="_blank" check
    connection.responses.set('Runtime.callFunctionOn', (params) => {
        if (params.functionDeclaration.includes('getAttribute(\'target\')')) {
            return { result: { value: '_blank' } };
        }
        return { result: { value: true } }; // for visibility checks
    });
    
    // Restore dispatch to work
    connection.responses.delete('Input.dispatchMouseEvent');

    const result = await mouse.clickElement({ uid: 'link-uid' });
    assert.ok(result.includes('New tab opened'), 'Should report new tab opening');
    console.log('✓ New tab handling correct');

    console.log('All tests passed!');
}

testMouseActions().catch(e => {
    console.error('Test failed:', e);
    process.exit(1);
});
