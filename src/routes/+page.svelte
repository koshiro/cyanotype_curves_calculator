<script lang="ts">
	import { version } from '$app/environment';
</script>

<main>
	<h1>Cyano Curve</h1>
	<p class="lead">
		Calibrador de curvas para negativos digitales de cianotipo. Todo el procesamiento ocurre en tu navegador:
		tus escaneos no salen de tu equipo.
	</p>
	<p class="status">Versión {version}, en construcción</p>
</main>

<style>
	/* Base = telefono; pantallas anchas solo amplian margenes. */
	main {
		max-width: var(--measure);
		margin-inline: auto;
		padding: var(--space-12) var(--space-4);
	}

	h1 {
		margin-block: 0 var(--space-4);
		font-size: var(--text-4xl);
		font-weight: var(--weight-semibold);
		line-height: var(--leading-tight);
		letter-spacing: -0.02em;
	}

	.lead {
		margin-block: 0 var(--space-6);
		font-size: var(--text-lg);
	}

	.status {
		margin: 0;
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: var(--text-sm);
	}

	@media (min-width: 48rem) {
		main {
			padding-block: var(--space-24);
		}

		h1 {
			font-size: var(--text-5xl);
		}
	}
</style>
