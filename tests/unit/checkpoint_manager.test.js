
// tests/unit/checkpoint_manager.test.js
import { strict as assert } from 'assert';
import { CheckpointManager } from '../../background/handlers/session/prompt/checkpoint_manager.js';

// Mock AutomationStateStore
class MockStateStore {
    constructor() {
        this.events = [];
    }
    async appendEvent(event) {
        this.events.push(event);
    }
}

async function testCheckpointManager() {
    console.log('Testing CheckpointManager...');
    const stateStore = new MockStateStore();
    const manager = new CheckpointManager({
        stateStore,
        segmentSize: 3,
        maxSegments: 2
    });

    // Test 1: Recording loops and segment detection
    manager.recordLoop({ loopCount: 1, toolName: 'tool1', output: 'out1' });
    manager.recordLoop({ loopCount: 2, toolName: 'tool2', output: 'out2' });
    assert.equal(manager.shouldPauseForSegment(2), false);
    
    manager.recordLoop({ loopCount: 3, toolName: 'tool3', output: 'out3' });
    assert.equal(manager.shouldPauseForSegment(3), true);
    console.log('✓ Segment pause detection passed');

    // Test 2: Summary generation
    const summary = await manager.composeSegmentSummary(0, 3);
    assert.equal(summary.segment, 1);
    assert.equal(summary.toolCalls.length, 3);
    assert.ok(stateStore.events.some(ev => ev.type === 'segment_summary'));
    console.log('✓ Summary generation passed');

    // Test 3: Max segments check
    manager.currentSegment = 3; // Simulate exceeding max (2)
    assert.equal(manager.hasExceededMaxSegments(7), true); // 7 loops / 3 = 3rd segment (> 2)
    console.log('✓ Max segments check passed');

    console.log('CheckpointManager tests completed.');
}

testCheckpointManager().catch(console.error);
