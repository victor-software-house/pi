import { afterEach, describe, expect, test, vi } from "vitest";
import { InteractiveMode } from "../../../src/modes/interactive/interactive-mode.ts";

// Regression for https://github.com/earendil-works/pi/issues/5724
//
// `proper-lockfile` installs `signal-exit`, whose signal listener re-sends
// SIGTERM/SIGHUP when it observes no other process listeners during the same
// signal dispatch. InteractiveMode must therefore keep its signal handlers
// registered until async terminal cleanup has completed.

type ShutdownThis = {
	isShuttingDown: boolean;
	finishShutdown: (exit: { code: number; reason: "quit" | "signal" }) => void;
	resolveShutdown: () => void;
	options: { onExit?: (exit: { code: number; reason: "quit" | "signal" }) => void };
	unregisterSignalHandlers: () => void;
	runtimeHost: { dispose: () => Promise<void> };
	ui: { terminal: { drainInput: (ms: number) => Promise<void> } };
	themeController: { disableAutoSync: () => void };
	stop: () => void;
};

type InteractiveModePrototypeWithShutdown = {
	shutdown(this: ShutdownThis, options?: { fromSignal?: boolean }): Promise<void>;
	finishShutdown(this: ShutdownThis, exit: { code: number; reason: "quit" | "signal" }): void;
};

const interactiveModePrototype = InteractiveMode.prototype as unknown as InteractiveModePrototypeWithShutdown;

class ProcessExitError extends Error {}

function deferred(): { promise: Promise<void>; resolve: () => void } {
	let resolve: (() => void) | undefined;
	const promise = new Promise<void>((res) => {
		resolve = res;
	});
	return {
		promise,
		resolve: () => resolve?.(),
	};
}

async function callShutdown(context: ShutdownThis, options?: { fromSignal?: boolean }): Promise<void> {
	try {
		await (interactiveModePrototype as InteractiveModePrototypeWithShutdown).shutdown.call(context, options);
	} catch (error) {
		if (!(error instanceof ProcessExitError)) throw error;
	}
}

describe("InteractiveMode SIGTERM shutdown with signal-exit (#5724)", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	test("keeps signal handlers registered while signal-triggered cleanup is pending", async () => {
		vi.spyOn(process, "exit").mockImplementation((() => {
			throw new ProcessExitError();
		}) as typeof process.exit);

		const order: string[] = [];
		const dispose = deferred();
		const context: ShutdownThis = {
			isShuttingDown: false,
			finishShutdown: interactiveModePrototype.finishShutdown,
			resolveShutdown: vi.fn(),
			options: {},
			unregisterSignalHandlers: vi.fn(() => {
				order.push("unregister");
			}),
			runtimeHost: {
				dispose: vi.fn(() => {
					order.push("dispose");
					return dispose.promise;
				}),
			},
			ui: {
				terminal: {
					drainInput: vi.fn(async () => {
						order.push("drainInput");
					}),
				},
			},
			themeController: { disableAutoSync: vi.fn() },
			stop: vi.fn(() => {
				order.push("stop");
			}),
		};

		const shutdownPromise = callShutdown(context, { fromSignal: true });
		await Promise.resolve();

		expect(order).toEqual(["dispose"]);
		expect(context.unregisterSignalHandlers).not.toHaveBeenCalled();

		dispose.resolve();
		await shutdownPromise;

		expect(order).toEqual(["dispose", "drainInput", "stop"]);
	});

	test("lets an embedded host observe clean signal shutdown without process exit", async () => {
		const exit = vi.fn();
		const releaseInput = vi.fn();
		const processExit = vi.spyOn(process, "exit").mockImplementation((() => {
			throw new ProcessExitError();
		}) as typeof process.exit);
		const context: ShutdownThis = {
			isShuttingDown: false,
			finishShutdown: interactiveModePrototype.finishShutdown,
			resolveShutdown: releaseInput,
			options: { onExit: exit },
			unregisterSignalHandlers: vi.fn(),
			runtimeHost: { dispose: vi.fn(async () => {}) },
			ui: { terminal: { drainInput: vi.fn(async () => {}) } },
			themeController: { disableAutoSync: vi.fn() },
			stop: vi.fn(),
		};

		await callShutdown(context, { fromSignal: true });

		expect(releaseInput).toHaveBeenCalledOnce();
		expect(exit).toHaveBeenCalledWith({ code: 0, reason: "signal" });
		expect(processExit).not.toHaveBeenCalled();
	});
});
