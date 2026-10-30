<script lang="ts">
	import { APP_NAME, APP_SUBTITLE, LOGO_URL } from './branding';
	import { deviceChoice } from './device';
	import Welcome from './components/Welcome.svelte';
    import AppTab from "./components/AppTab.svelte";
    import Icon from "./components/Icon.svelte";
    import IcongridGenerator from "./tabs/IcongridGenerator.svelte";
    import SpritesheetGenerator from "./tabs/SpritesheetGenerator.svelte";
	import type { Wasm_T } from './global';
	import { APP_VERSION } from 'virtual:app-version';

	export let wasm: Wasm_T;
	let characterName: string;

	let curChoice = "spsh";
	let darkMode = true;

	function toggleTheme()
	{
		// body + html both carry the class so the page background never mismatches
		document.body.classList.toggle('light-mode');
		document.documentElement.classList.toggle('light-mode');
	}

	// let test = wasm.greet("Friend!!");
</script>

{#if $deviceChoice === null}
<Welcome />
{:else}
<main id="app-shell">
	<header id="app-header">
		<div id="brand">
			<img id="brand-logo" src={LOGO_URL} alt="" width="52" height="30" draggable="false" />
			<div id="brand-text">
				<h1 id="title">{APP_NAME} <span id="version">v{APP_VERSION}</span></h1>
				<span id="subtitle">{APP_SUBTITLE}</span>
			</div>
		</div>

		<div id="app-tabs" role="tablist" aria-label="Mode">
			<AppTab id="spsh" icon="sheet" bind:curChoice={curChoice} text="Spritesheet Generation" shortText="Spritesheet" />
			<AppTab id="icongrid" icon="grid" bind:curChoice={curChoice} text="Icongrid Generation" shortText="Icongrid" />
		</div>

		<div id="header-tools">
			<div id="character-name-control">
				<label for="char-name">Character Name</label>
				<input type="text" name="char-name" id="char-name" placeholder="Character Name" autocomplete="off" autocapitalize="off" spellcheck="false" bind:value={characterName} />
			</div>

			<label for="dark-mode" id="theme-toggle" title="Toggle dark / light mode">
				<input type="checkbox" name="dark-mode" id="dark-mode" bind:checked={darkMode} on:change={toggleTheme}>
				<span class="switch-icon"><Icon name={darkMode ? 'moon' : 'sun'} size={18} /></span>
				<span class="switch-text">Dark Mode</span>
			</label>
		</div>
	</header>

	<!-- both modes stay mounted so switching tabs never discards what the user already added -->
	<div id="tab-container">
		<div class="pane pane-spsh" hidden={curChoice !== "spsh"}>
			<SpritesheetGenerator charname={characterName} wasm={wasm} />
		</div>
		<div class="pane pane-icon" hidden={curChoice !== "icongrid"}>
			<IcongridGenerator bind:charname={characterName} wasm={wasm} />
		</div>
	</div>
</main>
{/if}

<style>
	#app-shell {
		display: flex;
		flex-direction: column;
		height: 100vh;
		height: 100dvh;
		min-height: 520px;
		padding: var(--pad) var(--pad-x) var(--pad);
		padding-left: max(var(--pad-x), env(safe-area-inset-left));
		padding-right: max(var(--pad-x), env(safe-area-inset-right));
		padding-top: max(var(--pad), env(safe-area-inset-top));
		padding-bottom: max(var(--pad), env(safe-area-inset-bottom));
		gap: var(--gap);
	}

	#app-header {
		flex: none;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 12px;
	}

	#brand {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
	}

	#brand-logo {
		display: block;
		height: 30px;
		width: auto;
		flex: none;
		object-fit: contain;
	}

	#brand-text {
		display: flex;
		flex-direction: column;
		line-height: 1.15;
	}

	#title {
		margin: 0;
		font-size: 1.05rem;
		font-weight: 700;
		letter-spacing: 0.01em;
	}

	#version {
		font-size: 0.72rem;
		font-weight: 600;
		color: var(--text-muted);
		vertical-align: middle;
		padding: 1px 6px;
		border: 1px solid var(--border);
		border-radius: 999px;
	}

	#subtitle {
		font-size: 0.78rem;
		color: var(--text-muted);
	}

	#app-tabs {
		display: flex;
		gap: 10px;
		padding: 0 0 var(--btn-depth);
		flex: 0 1 auto;
		max-width: 520px;
	}

	#header-tools {
		display: flex;
		align-items: flex-start;
		align-items: center;
		gap: 12px;
		margin-left: auto;
		flex: 0 1 auto;
		min-width: 0;
	}

	#character-name-control {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
	}

	#character-name-control > label {
		font-size: 0.85rem;
		color: var(--text-muted);
		white-space: nowrap;
	}

	#char-name {
		width: 220px;
		max-width: 100%;
		min-width: 0;
	}

	#theme-toggle {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 0 12px;
		white-space: nowrap;
		margin-bottom: var(--btn-depth);
	}

	#theme-toggle input {
		/* the native checkbox stays for accessibility/state, visually replaced by the icon */
		position: absolute;
		opacity: 0;
		width: 1px;
		height: 1px;
	}

	#theme-toggle:focus-within {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.switch-icon {
		display: inline-flex;
		color: var(--accent);
	}

	.switch-text {
		font-size: 0.9rem;
	}

	#tab-container {
		flex: 1 1 auto;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}

	.pane {
		flex: 1 1 auto;
		min-height: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.pane[hidden] {
		display: none;
	}

	/* switching tabs: short fade (opacity only, no layout change) */
	.pane:not([hidden]) {
		animation: pane-in var(--dur-tab) var(--ease-in);
	}

	@keyframes pane-in {
		from { opacity: 0; transform: translateY(4px); }
		to { opacity: 1; transform: none; }
	}

	/* 10-11 inch tablets in landscape: keep everything on one header row */
	@media screen and (max-width: 1100px) {
		#character-name-control > label,
		.switch-text {
			display: none;
		}
		#char-name {
			width: 170px;
		}
	}

	/* tablet portrait and below: tabs take their own row */
	@media screen and (max-width: 900px) {
		#app-tabs {
			order: 3;
			min-width: 0;
			flex: 1 1 100%;
			max-width: none;
		}
		#subtitle {
			display: none;
		}
	}

	@media screen and (max-width: 560px) {
		#character-name-control > label,
		.switch-text {
			display: none;
		}
		#header-tools {
			flex: 1 1 auto;
		}
		#character-name-control {
			flex: 1 1 auto;
		}
		#char-name {
			width: 100%;
		}
	}
</style>
