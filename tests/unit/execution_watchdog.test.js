
// tests/unit/execution_watchdog.test.js
import { strict as assert } from 'assert';
import { ExecutionWatchdog, WatchdogTimeoutError } from '../../background/control/execution_watchdog.js';

// Mock AutomationStateStore
class MockStateStore {
    constructor() {
        this.events = [];
    }
    async appendEvent(event) {
        this.events.push(event);
    }
}

async function testExecutionWatchdog() {
    console.log('Testing ExecutionWatchdog...');
    const stateStore = new MockStateStore();
    const watchdog = new ExecutionWatchdog({
        defaultTimeout: 100,
        maxRetries: 2,
        stateStore,
        heartbeatInterval: 20
    });

    // Test 1: Successful execution
    try {
        const result = await watchdog.runWithWatchdog('test_success', async () => {
            return 'success';
        });
        assert.equal(result, 'success');
        console.log('✓ Success case passed');
    } catch (e) {
        console.error('✗ Success case failed:', e);
    }

    // Test 2: Timeout and Retry
    try {
        let attempts = 0;
        await watchdog.runWithWatchdog('test_timeout', async () => {
            attempts++;
            if (attempts <= 2) {
                // Simulate timeout by waiting longer than defaultTimeout (100ms)
                await new Promise(r => setTimeout(r, 150));
                throw new Error('Should have timed out'); // Should be caught by watchdog
            }
            return 'recovered';
        });
        assert.equal(attempts, 3); // Initial + 2 retries
        console.log('✓ Timeout/Retry case passed');
    } catch (e) {
        console.error('✗ Timeout/Retry case failed:', e);
    }

    // Test 3: Non-retryable error
    try {
        await watchdog.runWithWatchdog('test_fatal', async () => {
            throw new Error('Fatal error');
        });
        console.error('✗ Fatal error case failed (should have thrown)');
    } catch (e) {
        assert.ok(e.message.includes('Fatal error'));
        // Check if state store recorded events
        assert.ok(stateStore.events.some(ev => ev.type === 'action_error' && ev.classification.type === 'unknown'));
        console.log('✓ Fatal error case passed');
    }

    console.log('ExecutionWatchdog tests completed.');
}

testExecutionWatchdog().catch(console.error);
