import { createSubscriber } from "svelte/reactivity";

/**
 * @name @abstract V5State
 * @description A class that provides a state management solution for Svelte 5
 * @see https://svelte.dev/docs/state-management#v5-state-management
 * @see https://webjose.hashnode.dev/svelte-reactivity-lets-talk-about-effects#heading-the-inspecttrace-rune
 * @type T
 * @param T, state type
 * @example
 * ```ts
 * // v5Writable.svelte.ts
 * // Function form.  Not the preferred variant.
 * export function v5Writable<T>(initialValue: T) {
 * 	const store = $state({ value: initialValue });
 * 	return store;
 * }
 * ```
 */
// Class form.  This is the preferred variant.
export abstract class V5State<T> {
	#value = $state<T>() as T; // The type assertion is a trick to get rid of undesired "undefined".
	#subscribe;
	constructor(initialValue: T) {
		this.value = initialValue;
		// Keep a minimal subscriber hook so subclasses can safely read `.value`
		// from reactive contexts without introducing root effects.
		this.#subscribe = createSubscriber(() => {});
	}
	get value() {
		this.#subscribe();
		return this.#value;
	}
	set value(newValue: T) {
		this.#value = newValue;
	}

	dispose() {
		// No-op: this base class no longer creates long-lived root effects.
	}
}
