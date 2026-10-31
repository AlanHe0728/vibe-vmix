'use strict';

/**
 * @typedef {Record<string, unknown>} State
 * @typedef {{id: string, label: string, execute: (state: State, payload: State, now: number) => State}} Command
 * @typedef {Object} BroadcastModule
 * @property {string} id Stable module ID, e.g. football, basketball, stage.
 * @property {string} name Display name.
 * @property {string[]} [capabilities] Features a client can discover.
 * @property {(saved: State, now: number) => State} migrate Read old data without emitting events.
 * @property {(current: State, patch: State, now: number) => State} reduce Validate and produce the next state.
 * @property {(state: State, now: number) => State} status Lightweight data for control clients.
 * @property {Command[]} [commands] Named actions, shared by UI, HTTP and hardware adapters.
 * @property {(state: State, now: number) => (State|null)} [advance] Automatic transitions; null means no save.
 * @property {(state: State, now: number) => (State|null)} [pause] Pause running work when the host shuts down.
 *
 * Hooks are synchronous. They receive deeply frozen state and must return new plain JSON data.
 * Rules never import HTTP, Electron, filesystems or another module's private code.
 */

module.exports = {};
