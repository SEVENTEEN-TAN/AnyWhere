
// background/control/actions.js
import { NavigationActions } from './actions/navigation.js';
import { InputActions } from './actions/input.js';
import { ObservationActions } from './actions/observation.js';
import { EmulationActions } from './actions/emulation.js';
import { PerformanceActions } from './actions/performance.js';
import { WaitForHelper } from './wait_helper.js';

/**
 * Facade class that aggregates specific action modules.
 */
export class BrowserActions {
    constructor(connection, snapshotManager, controlOverlay = null) {
        // Initialize shared WaitHelper with default multipliers (1, 1)
        this.waitHelper = new WaitForHelper(connection);

        this.navigation = new NavigationActions(connection, snapshotManager, this.waitHelper);
        this.input = new InputActions(connection, snapshotManager, this.waitHelper, controlOverlay);
        this.observation = new ObservationActions(connection, snapshotManager, this.waitHelper);
        this.emulation = new EmulationActions(connection, snapshotManager, this.waitHelper);
        this.performance = new PerformanceActions(connection, snapshotManager, this.waitHelper);
    }

    // --- Navigation Delegates ---
    async navigatePage(args) { return this.navigation.navigatePage(args); }
    async newPage(args) { return this.navigation.newPage(args); }
    async closePage(args) { return this.navigation.closePage(args); }
    async listPages(args) { return this.navigation.listPages(args); }
    async selectPage(args) { return this.navigation.selectPage(args); }

    // P2 Enhancement: Tab stack navigation
    async switchToTab(args) { return this.navigation.switchToTab(args); }
    async returnToPreviousTab(args) { return this.navigation.returnToPreviousTab(args); }
    async getTabStack(args) { return this.navigation.getTabStack(args); }
    async clearTabStack(args) { return this.navigation.clearTabStack(args); }

    // --- Input Delegates ---
    async clickElement(args) { return this.input.clickElement(args); }
    async dragElement(args) { return this.input.dragElement(args); }
    async hoverElement(args) { return this.input.hoverElement(args); }
    async fillElement(args) { return this.input.fillElement(args); }
    async fillForm(args) { return this.input.fillForm(args); }
    async pressKey(args) { return this.input.pressKey(args); }
    async attachFile(args) { return this.input.attachFile(args); }

    // --- Observation Delegates ---
    async takeScreenshot(args) { return this.observation.takeScreenshot(args); }
    async evaluateScript(args) { return this.observation.evaluateScript(args); }
    async waitFor(args) { return this.observation.waitFor(args); }

    // --- Emulation Delegates ---
    async emulate(args) { return this.emulation.emulate(args); }
    async resizePage(args) { return this.emulation.resizePage(args); }

    // --- Performance Delegates ---
    async startTrace(args) { return this.performance.startTrace(args); }
    async stopTrace(args) { return this.performance.stopTrace(args); }
    async analyzeInsight(args) { return this.performance.analyzeInsight(args); }
}
