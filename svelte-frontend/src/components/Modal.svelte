<!-- https://svelte.dev/examples/modal -->
<script lang="ts">
	import Icon from "./Icon.svelte";

	export let showModal: boolean;
	export let onClose = ()=>{};

	let dialog: HTMLDialogElement;

	export let closeButtonMsg = "Close";
	// "md" for small forms, "lg" for wide tools (inspector / preview)
	export let size: 'md' | 'lg' = 'md';

	$: if (dialog){
		if(showModal)
		{
			dialog.showModal();
		}
		else
		{
			dialog.close();
		}
	};
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<dialog
	bind:this={dialog}
	class={size}
	on:close={() => { showModal = false; onClose();}}
	on:click|self={() => dialog.close()}
>
	<div class="shell" on:click|stopPropagation>
		<header class="modal-header">
			<div class="modal-title"><slot name="header" /></div>
			<button type="button" class="icon-btn btn-flat" aria-label="Close" on:click={() => dialog.close()}><Icon name="x" /></button>
		</header>
		<div class="modal-body">
			<slot />
		</div>
		<footer class="modal-footer">
			<slot name="accept-btn" />
			<!-- svelte-ignore a11y-autofocus -->
			<button autofocus on:click={() => dialog.close()}>{ closeButtonMsg }</button>
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
		width: min(560px, calc(100vw - 24px));
		max-width: none;
		max-height: calc(100dvh - 24px);
		overflow: hidden;
	}
	dialog.lg {
		width: min(1280px, calc(100vw - 24px));
		height: min(900px, calc(100dvh - 24px));
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
		padding: 8px 8px 8px 18px;
		border-bottom: 1px solid var(--border);
		flex: none;
	}
	.modal-title {
		font-size: 1.05rem;
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
		gap: 12px;
		padding: 12px 18px 16px;
		border-top: 1px solid var(--border);
		flex: none;
	}
	.modal-footer :global(button:not(.icon-btn)) {
		min-width: 110px;
	}
	/* the accept button (slot) is styled as the primary action in styles.css */
	dialog[open]::backdrop {
		animation: fade 0.15s ease-out;
	}
	@keyframes fade {
		from { opacity: 0; }
		to { opacity: 1; }
	}
</style>
