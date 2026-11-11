<!-- https://svelte.dev/examples/modal -->
<script lang="ts">
	import Icon from "./Icon.svelte";

	export let showModal: boolean;
	export let onClose = ()=>{};

	let dialog: HTMLDialogElement;

	export let closeButtonMsg = "Close";
	// "md" for small forms, "lg" for wide tools (inspector / preview)
	export let size: 'md' | 'lg' = 'md';
	// full: on phones the dialog is a full-screen page with a Back button (XML Inspector, Animation)
	export let full = false;
	// sheet: action sheet without footer (phone: docked to the bottom)
	export let sheet = false;

	let closing = false;
	const CLOSE_MS = 180; // = --dur-exit below
	const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

	// open / close driven by the parent (no animation when closed from outside)
	$: if (dialog){
		if(showModal)
		{
			if(!dialog.open) dialog.showModal();
		}
		else if(dialog.open)
		{
			dialog.close();
		}
	};

	// user-driven close (X, backdrop, buttons, Esc): fade + slide out, then really close
	function requestClose()
	{
		if(!dialog || !dialog.open || closing) return;
		if(reduced()) { dialog.close(); return; }
		closing = true;
		setTimeout(() => { closing = false; if(dialog.open) dialog.close(); }, CLOSE_MS);
	}
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<dialog
	bind:this={dialog}
	class={size}
	class:full
	class:sheet
	class:closing
	on:cancel|preventDefault={requestClose}
	on:close={() => { showModal = false; onClose();}}
	on:click|self={requestClose}
>
	<div class="shell" on:click|stopPropagation>
		<header class="modal-header">
			{#if full}
				<button type="button" class="back-btn btn-flat" on:click={requestClose}><Icon name="chevron-left" /> <span>Back</span></button>
			{/if}
			<div class="modal-title"><slot name="header" /></div>
			<button type="button" class="icon-btn btn-flat" aria-label="Close" on:click={requestClose}><Icon name="x" /></button>
		</header>
		<div class="modal-body">
			<slot />
		</div>
		{#if !sheet}
		<footer class="modal-footer">
			<slot name="accept-btn" />
			<!-- svelte-ignore a11y-autofocus -->
			<button autofocus on:click={requestClose}>{ closeButtonMsg }</button>
		</footer>
		{/if}
	</div>
</dialog>

<style>
	dialog {
		border: 1px solid var(--outline);
		border-radius: 12px;
		--radius: 10px;
		--radius-sm: 8px;
		padding: 0;
		background-color: var(--surface);
		color: var(--text);
		box-shadow: var(--shadow);
		width: min(var(--modal-w), calc(100vw - 2 * var(--modal-gutter)));
		max-width: none;
		max-height: calc(100dvh - 2 * var(--modal-gutter));
		overflow: hidden;
	}
	dialog.lg {
		width: min(var(--modal-lg-w), calc(100vw - 2 * var(--modal-gutter)));
		height: min(var(--modal-lg-h), calc(100dvh - 2 * var(--modal-gutter)));
	}
	dialog[open] {
		display: flex;
	}
	.shell {
		display: flex;
		flex-direction: column;
		width: 100%;
		min-height: 0;
		max-height: inherit;
	}
	dialog.lg .shell {
		height: 100%;
	}
	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 6px 8px 6px 18px;
		border-bottom: 1px solid var(--border);
		flex: none;
	}
	.modal-title {
		font-family: var(--font-serif);
		font-size: 1.02rem;
		font-weight: 700;
		min-width: 0;
	}
	.modal-title :global(h2),
	.modal-title :global(h3),
	.modal-title :global(h4),
	.modal-title :global(p) {
		margin: 0;
		font-size: inherit;
		font-weight: inherit;
		text-align: left;
	}
	.icon-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: var(--tap);
		padding: 0;
		color: var(--text-muted);
	}
	.modal-body {
		flex: 1 1 auto;
		min-height: 0;
		overflow: auto;
		overscroll-behavior: contain;
		-webkit-overflow-scrolling: touch;
		padding: 16px 18px;
	}
	dialog.lg .modal-body {
		display: flex;
		flex-direction: column;
	}
	.modal-footer {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 8px;
		padding: 12px 18px 14px;
		border-top: 1px solid var(--border);
		flex: none;
	}
	.modal-footer :global(button:not(.icon-btn)) {
		min-width: 96px;
	}
	/* the accept button (slot) is styled as the primary action in styles.css */
	/* open: fade + small slide up; close: fade + slide down. Size never changes (opacity/translate only). */
	dialog[open] {
		animation: modal-in var(--dur-modal) var(--ease-in);
	}
	dialog[open]::backdrop {
		animation: fade-in var(--dur-modal) var(--ease-in);
	}
	dialog.closing {
		pointer-events: none;
		animation: modal-out 180ms var(--ease-out) forwards;
	}
	dialog.closing::backdrop {
		animation: fade-out 180ms var(--ease-out) forwards;
	}
	@keyframes modal-in {
		from { opacity: 0; transform: translateY(10px); }
		to { opacity: 1; transform: none; }
	}
	@keyframes modal-out {
		from { opacity: 1; transform: none; }
		to { opacity: 0; transform: translateY(12px); }
	}
	@keyframes fade-in {
		from { opacity: 0; }
		to { opacity: 1; }
	}
	@keyframes fade-out {
		from { opacity: 1; }
		to { opacity: 0; }
	}
	.back-btn { display: none; align-items: center; gap: 4px; padding: 0 10px 0 4px; min-height: var(--tap); flex: none; }

	/* ----- phone: dialogs are bottom sheets; `full` ones are full-screen pages with a Back button ----- */
	:global(html[data-layout="phone"]) dialog:not(.full) {
		width: 100vw;
		margin: auto 0 0;
		max-height: 88dvh;
		border-radius: 14px 14px 0 0;
		border-bottom: 0;
		animation-name: sheet-in;
		animation-duration: 420ms;
		animation-timing-function: var(--ease-spring);
	}
	:global(html[data-layout="phone"]) dialog:not(.full) .modal-body { padding-bottom: max(12px, env(safe-area-inset-bottom)); }
	:global(html[data-layout="phone"]) dialog:not(.full) .modal-footer { padding-bottom: max(10px, env(safe-area-inset-bottom)); }
	:global(html[data-layout="phone"]) dialog:not(.full).closing { animation-name: sheet-out; }
	:global(html[data-layout="phone"]) dialog.full {
		width: 100vw; height: 100dvh; max-height: 100dvh; max-width: 100vw;
		margin: 0; border-radius: 0; border: 0;
		padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
	}
	:global(html[data-layout="phone"]) dialog.full .back-btn { display: inline-flex; }
	:global(html[data-layout="phone"]) dialog.full .modal-footer { display: none; }
	:global(html[data-layout="phone"]) dialog.full .modal-body { padding: 8px 10px; }
	:global(html[data-layout="phone"]) dialog.full .modal-header > .icon-btn { display: none; }
	:global(html[data-layout="phone"]) dialog.full .modal-title { flex: 1 1 auto; }
	@keyframes sheet-in { from { opacity: 0.4; transform: translateY(70px); } to { opacity: 1; transform: none; } }
	@keyframes sheet-out { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateY(40px); } }
	@media (prefers-reduced-motion: reduce) {
		dialog[open], dialog[open]::backdrop, dialog.closing, dialog.closing::backdrop { animation: none; }
	}
</style>
