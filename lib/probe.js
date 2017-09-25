const ChildProcess = require('child_process'),
      Blast        = __Protoblast,
      Obj          = Blast.Bound.Object,
      Fn           = Blast.Bound.Function,
      fs           = require('fs'),
      MC           = Fn.getNamespace('Develry.MediaConversion');

/**
 * The Probe Class
 *
 * @constructor
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.2.0
 */
var Probe = Fn.inherits('Informer', 'Develry.MediaConversion', function Probe(parent, options) {

	// The parent (Input, Output, Stream or MediaConversion)
	this.parent = parent;

	this.options = options || {};

	// Data arrays
	this.probe_data = [];
	this.err_data = [];

	// Eventual exit code
	this.exit_code = null;

	// Has the process finished?
	this.finished = false;

	// Detect interlacing?
	this.detect_interlacing = false;

	this.init();
});

/**
 * Result maps
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @type     {Object}
 */
Probe.setProperty('result_map', {});

/**
 * Map something
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 *
 * @param    {String}   name     The name of the argument
 * @param    {String}   path     The path in the result object
 *
 * @return   {this}
 */
Probe.setStatic(function mapResult(name, path) {

	var that = this;

	this.prototype.result_map[name] = path;
});

/**
 * Get a certain value from the probe
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {String}   name
 * @param    {Function} callback
 */
Probe.setAfterMethod('result', function getValue(name, callback) {

	var that = this,
	    path = this.result_map[name],
	    val;

	if (path) {
		if (typeof path == 'string') {
			val = Obj.path(this.result, path);
		} else {
			val = path.call(this, this.result);
		}

		return callback(null, val);
	}

	return callback(new Error('There is no mapping for "' + name + '"'));
});

/**
 * Create the ffprobe process
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Stream}   input
 */
Probe.setMethod(function init() {

	var that = this,
	    iproc,
	    proc,
	    args;

	args = [
		'-show_streams',
		'-show_format',

		// Requesting frame entries means it'll never stop until the stream ends
		//'-show_entries', 'frame=pkt_pts_time,pkt_duration_time,interlaced_frame',

		'-loglevel', 'warning',
		'-i', 'pipe:0'
	];

	if (this.options.input_type) {
		args.unshift('-f', this.options.input_type);
	}

	// Start the process
	proc = ChildProcess.spawn(this.options.ffprobe_path || '/usr/bin/ffprobe', args);

	// Set the encoding
	proc.stdout.setEncoding('utf8');
	proc.stderr.setEncoding('utf8');

	// Listen on the stdout
	proc.stdout.on('data', function onStdOut(data) {
		that.probe_data.push(data);
	});

	// Listen for error messages
	proc.stderr.on('data', function onStdErr(data) {
		that.err_data.push(data);
	});

	proc.on('exit', function onExit(code) {
		that.cleanup(null, code);
	});

	// The stdin of the process closes before
	// sending the correct close events,
	// so just ignore errors
	proc.stdin.on('error', function onStdinError(err) {
		// Ignore!
	});

	proc.on('error', function onError(err) {
		that.cleanup(err);
	});

	proc.on('close', function onClose() {
		that.cleanup();
	});

	if (this.detect_interlacing) {

		// Create an ffmpeg instance with the idet filter
		iproc = ChildProcess.spawn('/usr/bin/ffmpeg', ['-i', 'pipe:0', '-vf', 'idet', '-f', 'null', '-']);

		// Listen to the standard output
		iproc.stdout.on('data', function onData(data) {
			// @todo: do something useful with this
			console.log('Interlace probe result: ' + data);
		});

		this.iproc = iproc;
	}

	this.process = proc;
});

/**
 * Clean up the probe
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Error}   err
 */
Probe.setMethod(function cleanup(err, code) {

	var that = this;

	if (!that.finished && that.iproc) {
		// Let everyone know iproc is dead
		that.iproc_killed = true;

		// End the input stream
		that.iproc.stdin.end();
	}

	that.finished = true;

	if (arguments.length == 2) {
		that.exit_code = code;
	} else if (arguments.length == 1) {
		that.emit('error', err);
	} else if (arguments.length == 0) {
		that._parse();
	}
});

/**
 * Probe the given stream
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Stream}   input
 */
Probe.setMethod(function setStream(input, callback) {

	var that = this,
	    err;

	if (this.start_time) {
		err = new Error('Stream already set');

		if (callback) {
			return callback(err);
		} else {
			throw err;
		}
	}

	this.start_time = Date.now();

	if (typeof input == 'string') {
		input = fs.createReadStream(input);
	}

	input.on('data', function gotData(data) {

		// Write the data to the interlace detector
		if (that.detect_interlacing && that.iproc && !that.iproc_killed) {
			that.iproc.stdin.write(data);
		}

		if (!that.finished && that.process.stdin.writable) {
			that.process.stdin.write(data);
		} else if (that.proc2killed) {
			input.removeListener('data', gotData);

			if (input.destroy) {
				input.destroy();
			} else if (input.end) {
				input.end();
			}
		}
	});

	if (callback) {
		this.on('result', function onResult(result) {
			callback(null, result);
		});
	}

	input.resume();
});

/**
 * Find blocks
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Probe.setMethod(function findBlocks(str) {

	var stream_start = str.indexOf('[STREAM]') + 8,
	    stream_end   = str.lastIndexOf('[/STREAM]'),
	    format_start = str.indexOf('[FORMAT]') + 8,
	    format_end   = str.lastIndexOf('[/FORMAT]'),
	    blocks;

	blocks = {
		streams: null,
		format: null
	};

	if (stream_start !== 7 && stream_end !== -1) {
		blocks.streams = str.slice(stream_start, stream_end).trim();
	}

	if (format_start !== 7 && format_end !== -1) {
		blocks.format = str.slice(format_start, format_end).trim();
	}

	return blocks;
});

/**
 * Parse the given block
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Probe.setMethod(function parseBlock(block) {

	var block_object = {},
	    lines = block.split('\n'),
	    data,
	    i;

	for (i = 0; i < lines.length; i++) {
		data = lines[i].split('=');

		if (data && data.length === 2) {
			block_object[data[0]] = this.parseField(data[1]);
		}
	}

	return block_object;
});

/**
 * Parse stream data
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Probe.setMethod(function parseStreams(text) {

	var codec_data,
	    streams,
	    s_index,
	    blocks,
	    stream,
	    i;

	if (!text) {
		return {streams: null};
	}

	streams = [];
	blocks = text.replace('[STREAM]\n', '').split('[/STREAM]');

	for (i = 0; i < blocks.length; i++) {
		stream = blocks[i];
		codec_data = this.parseBlock(stream);
		s_index = codec_data.index;

		delete codec_data.index;

		if (s_index) {
			streams[s_index] = codec_data;
		} else {
			streams.push(codec_data);
		}
	}

	return {streams: streams};
});

/**
 * Parse format data
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Probe.setMethod(function parseFormat(text) {

	var raw_format,
	    metadata,
	    format,
	    block,
	    attr;

	if (!text) {
		return {format: null};
	}

	block = text.replace('[FORMAT]\n', '').replace('[/FORMAT]', '');
	raw_format = this.parseBlock(block);
	format = {};
	metadata = {};

	//REMOVE metadata
	delete raw_format.filename;

	for (attr in raw_format) {
		if (raw_format.hasOwnProperty(attr)) {
			if (attr.indexOf('TAG') === -1) {
				format[attr] = raw_format[attr];
			} else {
				metadata[attr.slice(4)] = raw_format[attr];
			}
		}
	}

	return {format: format, metadata: metadata};
});

/**
 * Parse a field
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Probe.setMethod(function parseField(str) {

	var result = ('' + str).trim();

	if (result.match(/^\d+\.?\d*$/)) {
		result = parseFloat(result);
	} else {
		if (result == 'N/A') {
			result = null;
		}
	}

	return result;
});

/**
 * Parse the data
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.2.0
 */
Probe.setMethod(function _parse() {

	var raw_data,
	    streams,
	    blocks,
	    format,
	    result,
	    stream,
	    i;

	// Turn all the data into 1 string
	raw_data = this.probe_data.join('');

	// Get all the blocks
	blocks = this.findBlocks(raw_data);

	// Get all the strams
	streams = this.parseStreams(blocks.streams);

	// Get the format
	format = this.parseFormat(blocks.format);

	if (this.exit_code) {
		return this.emit('error', this.err_data.join(''));
	}

	result = {
		probe_time: Date.now() - this.start_time,
		streams: streams.streams,
		format: format.format,
		metadata: format.metadata
	};

	// Now set first video & audio stream
	for (i = 0; i < result.streams.length; i++) {
		stream = result.streams[i];

		if (stream.codec_type == 'video' && !result.video) {
			result.video = stream;
		} else if (stream.codec_type == 'audio' && !result.audio) {
			result.audio = stream;
		}
	}

	this.result = result;

	this.emit('result', result);

	if (this.parent && this.parent.emit) {
		this.parent.emit('probed', result, this);
	}
});

Probe.mapResult('video_codec', 'video.codec_name');
Probe.mapResult('audio_codec', 'audio.codec_name');

/**
 * Get the video size
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 */
Probe.mapResult('video_size', function getSize(data) {

	if (!data.video) {
		return null;
	}

	return data.video.width + 'x' + data.video.height;
});

/**
 * Get the framerate
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.2.0
 * @version  0.2.0
 */
Probe.mapResult('framerate', function getRate(data) {

	if (!data.video) {
		return 25;
	}

	let rate = data.video.r_frame_rate,
	    pieces = rate.split('/'),
	    result;

	if (pieces.length == 1) {
		result = pieces[0];
	} else {
		result = pieces[0] / pieces[1];
	}

	return result;
});

module.exports = Probe;