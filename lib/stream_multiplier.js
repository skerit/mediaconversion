var PassThrough = require('readable-stream').PassThrough,
    Blast,
    Obj,
    Fn;

if (typeof __Protoblast) {
	Blast = __Protoblast;
} else {
	Blast = require('protoblast')(false);
}

Obj = Blast.Bound.Object;
Fn = Blast.Bound.Function;

/**
 * StreamMultiplier class:
 * Re-use a single stream for multiple purposes.
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {Stream}   original_stream
 */
var Multiplier = Fn.inherits('Informer', 'Develry', function StreamMultiplier(stream) {

	var that = this;

	// Store the original stream
	this.original_stream = stream;

	// Array to store target passthrough streams
	this.target_streams = [];

	// It hasn't started yet
	this.started = false;

	// The amount of forks
	this.forks = 0;

	// Is this destroyed?
	this.destroyed = false;

	// Pipe the data
	stream.on('data', function onData(chunk) {

		var i;

		that.started = true;

		for (i = 0; i < that.target_streams.length; i++) {
			if (that.target_streams[i] && !that.target_streams[i]._writableState.ended) {
				that.target_streams[i].write(chunk);
			}
		}
	});

	// Make sure the streams end
	stream.on('end', function onEnd() {
		for (var i = 0; i < that.target_streams.length; i++) {
			if (that.target_streams[i]) {
				that.target_streams[i].end();
			}
		}
	});
});

/**
 * Pause the original stream
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 */
Multiplier.setMethod(function pause() {
	this.original_stream.pause();
});

/**
 * Resume the original stream
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 */
Multiplier.setMethod(function resume() {
	this.original_stream.resume();
});

/**
 * Destroy all the streams
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 */
Multiplier.setMethod(function destroy() {
	// @todo: add more methods of stopping the stream
	if (this.original_stream.destroy) {
		this.original_stream.destroy();

		// Indicate this multiplier has been destroyed
		this.destroyed = true;
	}
});

/**
 * Remove a stream by its id
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 */
Multiplier.setMethod(function removeFork(id) {
	if (this.target_streams[id]) {
		// Nullify the passthrough
		this.target_streams[id] = null;

		// Decrease the fork count
		this.forks--;

		// If there are no more forks, destroy this multiplier
		if (this.forks < 1) {
			this.destroy();
		}
	}
});

/**
 * Get new stream.
 * If the original stream has already started,
 * only new data will be forwarded.
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @return   {PassThrough}
 */
Multiplier.setMethod(['createStream', 'fork'], function createStream() {

	var that = this,
	    result,
	    id;

	if (this.destroyed) {
		throw new Error('Can not create a fork, StreamMultiplier has been destroyed');
	}

	result = new PassThrough();

	// Increase the fork count
	this.forks++;

	// Indicate this is a duplicated stream
	result.duplicatedStream = true;

	// Indicate if this is a partial stream
	if (this.started) {
		result.partialDuplicatedStream = true;
	}

	result.end = function onEnd() {
		ended();
	};

	result.on('end', ended);
	result.on('finish', ended);
	result.on('close', ended);
	result.on('unpipe', ended);

	function ended(e) {
		that.removeFork(id);
	}

	id = this.target_streams.push(result) - 1;

	this.resume();

	return result;
});

module.exports = Multiplier;