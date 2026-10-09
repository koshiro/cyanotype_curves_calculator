<script lang="ts">
	import { version } from '$app/environment';
</script>

<main>
	<h1>Cyano Curve</h1>
	<p>
		Calibrador de curvas para negativos digitales de cianotipo. Todo el procesamiento ocurre en tu navegador:
		tus escaneos no salen de tu equipo.
	</p>
	<p class="status">Versión {version} · en construcción</p>
</main>

<style>
	main {
		max-width: 42rem;
		margin-inline: auto;
		padding: calc(var(--space) * 4) var(--space);
	}

	h1 {
		margin-block: 0 var(--space);
		font-size: clamp(1.75rem, 4vw + 1rem, 2.75rem);
		letter-spacing: -0.02em;
	}

	.status {
		color: var(--text-muted);
		font-family: var(--font-mono);
		font-size: 0.875rem;
	}
</style>
