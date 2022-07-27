<script>
	import { DateTime } from 'luxon';
	let showIpAddress = false;
	let autoRefresh = false;
	let severity = '';
	let hostname = '';
	let ipAddress = '';
	let endTime = DateTime.now();
	let startTime = endTime.minus({ minutes: 15 });

	const lastNMinutes = (/** @type {number} */ minutes) => () => {
		endTime = DateTime.now();
		startTime = endTime.minus({ minutes });
	};
</script>

<div>
	<div>
		<div>
			<input
				type="datetime-local"
				value={startTime?.toISO({ includeOffset: false })}
				on:change={(e) => (startTime = DateTime.fromISO(e.currentTarget.value))}
			/>
			<input
				type="datetime-local"
				value={endTime?.toISO({ includeOffset: false })}
				on:change={(e) => (endTime = DateTime.fromISO(e.currentTarget.value))}
			/>
		</div>
	</div>
	<div>
		Last
		<button on:click={lastNMinutes(5)}>5m</button>
		<button on:click={lastNMinutes(15)}>15m</button>
		<button on:click={lastNMinutes(1400)}>1d</button>
		<button on:click={lastNMinutes(5_259_600)}>10y</button>
	</div>
	<div>
		<h4>Settings:</h4>
		<label>IP Address: <input type="checkbox" bind:checked={showIpAddress} /></label>
		<label>Auto Refresh: <input type="checkbox" bind:checked={autoRefresh} /></label>
	</div>
</div>
