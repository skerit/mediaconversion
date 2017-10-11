var Blast = require('protoblast')(false),
    Obj = Blast.Bound.Object,
    Fn = Blast.Bound.Function;

/**
 * ChunkedStream
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {Object}   options
 */
var ChunkedStream = Fn.inherits('Develry.MediaConversion.MediaStream', function ChunkedStream(options) {

	ChunkedStream.super.call(this, options);

	// The buffer
	this.chunk_buffer = null;

	// Store options for later
	this.options = options || {};

	// The wanted chunksize
	this.chunk_size = this.options.size;
});

/**
 * Transform the stream
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 */
ChunkedStream.setMethod(function _transform(chunk, encoding, callback) {

	if (this.chunk_buffer == null) {
		if (chunk.length == this.chunk_size) {
			this.push(chunk);
			callback();
			return;
		}

		if (chunk.length < this.chunk_size) {
			this.chunk_buffer = chunk;
			callback();
			return;
		}

		if (chunk.length > this.chunk_size) {
			// Push the wanted piece size
			this.push(chunk.slice(0, this.chunk_size));

			// And recursively process the rest
			return this._transform(chunk.slice(this.chunk_size), encoding, callback);
		}
	}

	chunk = Buffer.concat([this.chunk_buffer, chunk]);
	this.chunk_buffer = null;

	return this._transform(chunk, encoding, callback);
});
