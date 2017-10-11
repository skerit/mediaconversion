var Blast = require('protoblast')(false),
    Obj = Blast.Bound.Object,
    Fn = Blast.Bound.Function;

/**
 * FpsStream
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {Object}   options
 */
var FpsStream = Fn.inherits('Develry.MediaConversion.MediaStream', function FpsStream(options) {

	var that = this;

	if (!options) {
		options = {};
	}

	FpsStream.super.call(this, options);

	// Some options
	this.options = options || {};

	// The fps
	this.fps = options.fps || 4;

	// The buffer queue
	this.queue = [];

	setTimeout(function checkQueue() {

		if (that._writableState.ended) {
			return;
		}

		if (that.queue.length) {
			let data = that.queue.shift();
			that.push(data.chunk);

			if (data.callback) {
				data.callback();
			}
		}

		setTimeout(checkQueue, 1000 / that.fps);

	}, 1000 / this.fps)
});

/**
 * Transform the stream
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 */
FpsStream.setMethod(function _transform(chunk, encoding, callback) {

	var data = {
		chunk: chunk
	};

	this.queue.push(data);

	if (this.queue.length < this.fps) {
		callback();
	} else {
		data.callback = callback;
	}
});
