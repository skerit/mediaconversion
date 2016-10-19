var PassThrough = require('stream').PassThrough,
    Blast = require('protoblast')(false),
    Obj = Blast.Bound.Object,
    Fn = Blast.Bound.Function;

/**
 * StreamMultiplier class:
 * Re-use a single stream for multiple purposes.
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Stream}   original_stream
 * @param    {String}   name
 */
var Multiplier = Fn.inherits('Informer', 'Develry', function StreamMultiplier(stream, name) {

	var that = this;

	// Store the original stream
	this.original_stream = stream;

	// Array to store target passthrough streams
	this.target_streams = [];

	// Optional name
	this.name = name;

	// Share any parent datasets
	if (stream.parent_multiplier) {
		this.dataset = stream.parent_multiplier.dataset;
	} else {
		this.dataset = {};
	}

	// It hasn't started yet
	this.started = false;

	// The amount of forks
	this.forks = 0;

	// Reaped forks
	this.reaped_forks = 0;

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

		chunk = null;
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
 * Attach data to all forks of this stream
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {String}   name
 * @param    {Mixed}    value
 */
Multiplier.setMethod(function data(name, value) {

	if (arguments.length == 1) {
		return this.dataset[name];
	}

	this.dataset[name] = value;
});

/**
 * Pause the original stream
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Multiplier.setMethod(function pause() {
	this.original_stream.pause();
});

/**
 * Resume the original stream
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Multiplier.setMethod(function resume() {
	this.original_stream.resume();
});

/**
 * Destroy all the streams
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
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
 * @since    0.1.0
 * @version  0.1.0
 */
Multiplier.setMethod(function removeFork(id) {

	if (this.target_streams[id]) {
		// Nullify the passthrough
		this.target_streams[id] = null;

		// Decrease the fork count
		this.forks--;

		// Increase the reaped count
		this.reaped_forks++;

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
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {String}   name
 *
 * @return   {PassThrough}
 */
Multiplier.setMethod(['createStream', 'fork'], function createStream(name) {

	var that = this,
	    result,
	    piper,
	    pipes = 0,
	    id;

	if (this.destroyed) {
		throw new Error('Can not create a fork, StreamMultiplier has been destroyed');
	}

	// Create a new passthrough stream
	result = new PassThrough({allowHalfOpen: false});

	// Create a reference to this multiplier
	result.parent_multiplier = this;

	// Give it a name
	result.fork_name = name;

	// Get the original pipe method
	piper = result.pipe;

	// Create a new pipe method,
	// because piping a passthrough into something doesn't
	// emit a 'pipe' event
	result.pipe = function pipe(destination) {

		var cleanPipe;

		// Increase the pipe count
		pipes++;

		// Create cleaner function that can only be executed once
		cleanPipe = Fn.regulate(function cleanPipe() {

			// Decrease pipe count
			pipes--;

			// When there are no pipes left, this stream has ended
			if (pipes == 0) {
				ended();
			}
		});

		destination.on('end', cleanPipe);
		destination.on('finish', cleanPipe);
		destination.on('close', cleanPipe);
		destination.on('unpipe', cleanPipe);
		destination.on('error', cleanPipe);

		// Call the original pipe method
		piper.call(this, destination);
	};

	// Increase the fork count
	this.forks++;

	// Indicate this is a duplicated stream
	result.duplicatedStream = true;

	// Indicate if this is a partial stream
	if (this.started) {
		result.partialDuplicatedStream = true;
	}

	// Method to end the stream
	result.end = function onEnd() {
		ended();
	};

	// forked streams can also access the dataset
	result.data = function data(name, value) {

		if (arguments.length == 1) {
			return that.dataset[name];
		}

		that.dataset[name] = value;
	};

	result.on('end', ended);
	result.on('finish', ended);
	result.on('close', ended);
	result.on('error', ended);

	function ended(e) {
		that.removeFork(id);
	}

	id = this.target_streams.push(result) - 1;

	this.resume();

	return result;
});

module.exports = Multiplier;