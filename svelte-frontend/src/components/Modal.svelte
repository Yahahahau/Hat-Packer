<!-- https://svelte.dev/examples/modal -->
<script lang="ts">
	import Icon from "./Icon.svelte";

	export let showModal: boolean;
	export let onClose = ()=>{};

	let dialog: HTMLDialogElement;

	export let closeButtonMsg = "Close";
	// "md" for small forms, "lg" for wide tools (inspector / preview)
	export let size: 'md' | 'lg' = 'md';

	let closing = false;
	const CLOSE_MS = 170;
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
	class:closing
	on:cancel|preventDefault={requestClose}
	on:close={() => { showModal = false; onClose();}}
	on:click|self={requestClose}
>
	<div class="shell" on:click|stopPropagation>
		<header class="modal-header">
			<div class="modal-title"><slot name="header" /></div>
			<button type="button" class="icon-btn btn-flat" aria-label="Close" on:click={requestClose}><Icon name="x" /></button>
		</header>
		<div class="modal-body">
			<slot />
		</div>
		<footer class="modal-footer">
			<slot name="accept-btn" />
			<!-- svelte-ignore a11y-autofocus -->
			<button autofocus on:click={requestClose}>{ closeButtonMsg }</button>
		</footer>
	</div>
</dialog>

<style>
	dialog {
		border: 1px solid var(--border-strong);
		border-radius: 14px;
		padding: 0;
		background-color: var(--surface);
		color: var(--text);
		box-shadow: var(--shadow);
		width: min(480px, calc(100vw - 20px));
		max-width: none;
		max-height: calc(100dvh - 20px);
		overflow: hidden;
	}
	dialog.lg {
		width: min(1180px, calc(100vw - 20px));
		height: min(820px, calc(100dvh - 20px));
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
		padding: 4px 4px 4px 14px;
		border-bottom: 1px solid var(--border);
		flex: none;
	}
	.modal-title {
		font-size: 0.98rem;
		font-weight: 600;
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
		padding: 12px 14px;
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
		padding: 8px 14px 10px;
		border-top: 1px solid var(--border);
		flex: none;
	}
	.modal-footer :global(button:not(.icon-btn)) {
		min-width: 96px;
	}
	/* the accept button (slot) is styled as the primary action in styles.css */
	/* open: fade + small slide up; close: fade + slide down. Size never changes (opacity/translate only). */
	dialog[open] {
		animation: modal-in 0.2s cubic-bezier(0.2, 0.8, 0.3, 1);
	}
	dialog[open]::backdrop {
		animation: fade-in 0.2s ease-out;
	}
	dialog.closing {
		pointer-events: none;
		animation: modal-out 0.17s ease-in forwards;
	}
	dialog.closing::backdrop {
		animation: fade-out 0.17s ease-in forwards;
	}
	@keyframes modal-in {
		from { opacity: 0; transform: translateY(14px); }
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
	@media (prefers-reduced-motion: reduce) {
		dialog[open], dialog[open]::backdrop, dialog.closing, dialog.closing::backdrop { animation: none; }
	}
</style>
