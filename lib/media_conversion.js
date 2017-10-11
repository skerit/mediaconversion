const ChildProcess = require('child_process'),
      fc_cache     = {},
      libpath      = require('path'),
      mkdirp       = require('mkdirp'),
      Blast        = __Protoblast,
      Obj          = Blast.Bound.Object,
      Fn           = Blast.Bound.Function,
      fs           = require('fs'),
      MC           = Fn.getNamespace('Develry.MediaConversion');

/**
 * The MediaConversion Class
 *
 * @constructor
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  1.0.0
 */
var Conversion = Fn.inherits('Informer', 'Develry.MediaConversion', function MediaConversion(settings) {

	if (!settings) {
		settings = {};
	}

	// Process-wide settings
	this.settings = settings;

	// The global arguments
	this.arguments = {
		'hide_banner' : ''
	};

	// Extra arguments
	this.extra_arguments = [];

	// The inputs
	this.inputs = [];

	// And the outputs
	this.outputs = [];

	// Get the working path already
	this.getWorkingPath();

	// And get the formats, too
	this.getFormats();
});

/**
 * The niceness level
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.1
 *
 * @type     {Number}
 */
Conversion.setProperty('niceness', 19);

/**
 * The ffmpeg path
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  1.0.0
 *
 * @type     {String}
 */
Conversion.setProperty(function ffmpeg_path() {
	return this.settings.ffmpeg_path || '/usr/bin/ffmpeg';
}, function setPath(val) {
	this.settings.ffmpeg_path = val;
});

/**
 * Set a certain argument handler
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {String}   name     The name of the argument
 * @param    {String}   flag     The flag to use in the command
 * @param    {Function} handler  The handler function
 *
 * @return   {this}
 */
Conversion.setStatic(function setArgument(name, flag, handler) {

	var classified = Blast.Bound.String.camelize(name),
	    prev_flag,
	    cur_flag,
	    flag_fnc;

	if (typeof flag == 'function') {
		flag_fnc = flag;
	}

	// Set the method that will set the argument value
	this.setMethod('set' + classified, function argSetter(...args) {

		var value;

		if (handler) {
			value = handler.apply(this, args);
		} else {
			value = args[0];
		}

		if (flag_fnc) {
			cur_flag = flag_fnc.call(this, value, ...args);
		} else {
			cur_flag = flag;
		}

		this.arguments[cur_flag] = value;

		return this;
	});

	// Set the method that will get the argument value
	this.setMethod('get' + classified, function argGetter(...args) {

		if (flag_fnc) {
			if (!cur_flag) {
				return null;
			}
		} else if (!cur_flag) {
			cur_flag = flag;
		}

		return this.arguments[cur_flag];
	});
});

/**
 * Debug logging
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @return   {this}
 */
Conversion.setMethod(function debug(...args) {
	if (this.settings.debug) {
		console.log('[DEBUG]', ...args);
	}
});

/**
 * Add extra arguments
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @return   {this}
 */
Conversion.setMethod(function addArguments(...args) {

	var i;

	for (i = 0; i < args.length; i++) {
		this.extra_arguments.push(args[i]);
	}

	return this;
});

/**
 * Available profiles
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Conversion.setStatic('profiles', {});

/**
 * Realtime default options
 * (applied before regular default options)
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Conversion.setStatic('realtime_defaults', {

	// Use a buffer so the bitrate is kept in check
	bufsize    : '128k',

	// Deadline isn't used by every codec, but set it anyway
	deadline   : 'realtime',

	// Same for preset
	preset     : 'ultrafast',

	// Use less threads to not tax the system too much
	threads    : 2
});

/**
 * Default options (after processing profile)
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Conversion.setStatic('defaults', {

	// Probe the stream, if codecs match
	// don't do any encoding
	allow_copy  : true,

	// Copy the timestamp
	copyts      : true,

	// Default working directory id
	dirid       : 'def',

	// Don't specify a duration
	duration    : null,

	// Don't force encoding by default
	force_audio_encode: false,
	force_video_encode: false,
	
	// Don't force probing the video by default
	force_probe : false,

	// Use pipe input
	input       : 'pipe:0',

	// Do a single pass by default (other values are 1 or 2)
	pass        : null,

	// Don't use a start time
	start       : null,

	// Don't be too strict, don't quit on experimental arguments
	strict      : -2,

	// Use up to 6 threads
	threads     : 6
});

/**
 * Probe a stream
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Conversion.setStatic(function probe(stream) {
	var probe = new MediaProbe();

	probe.setStream(stream);

	return probe;
});

/**
 * Register a profile
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Conversion.setStatic(function registerProfile(name, fnc) {

	if (typeof name == 'function') {
		fnc = name;
		name = fnc.name;
	}

	this.profiles[name] = fnc;
});

/**
 * Get the working path
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {Function}   callback
 */
Conversion.setMethod(function getWorkingPath(callback) {

	var that = this;

	if (!callback) {
		callback = Fn.thrower;
	}

	if (this._getting_working_path) {
		return that.afterOnce('working_path', function donePath() {
			callback(null, that._working_path);
		});
	}

	this._getting_working_path = true;

	that.getStoragePath(function gotPath(err, result_path) {
		if (err) {
			return callback(err);
		}

		// Construct the working path
		let path = libpath.resolve(result_path, 'mc-tmp');

		that._working_path = path;
		that.emit('working_path');

		that.createDir(path, function created(err) {
			callback(err, path);
		});
	});
});

/**
 * Cleanup the conversion
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {Error}   err
 */
Conversion.setMethod(function cleanup(err) {

	if (this._cleaned_up) {
		return;
	}

	this.debug('Cleaning up FFmpeg process');

	this._cleaned_up = true;

	if (!err && this.seen_error) {
		err = this.seen_error;
	} else if (err && typeof err == 'number') {
		let code = err;
		err = null;

		if (this.seen_error) {
			err = this.seen_error;
		} else if (this.last_error) {
			let splits = this.last_error.trim().split('\n');
			err = splits[splits.length - 1];
		}

		if (!err) {
			err = new Error('FFmpeg exited with code ' + code);
		} else {
			err = new Error('FFmpeg exited with code ' + code + '\n' + err);
		}
	}

	// Cleanup inputs
	this.inputs.forEach(function eachInput(input) {
		input.destroy();
	});

	if (err) {
		// And outputs
		this.outputs.forEach(function eachOutput(output) {
			output.destroy();
		});
	}

	this.stop(err);
});

/**
 * Create a new input
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {String|Stream}   source
 *
 * @return   {Develry.MediaConversion.Input}
 */
Conversion.setMethod(function addInput(source) {

	var result = new MC.Input(source, this),
	    id;

	// Add this to the inputs
	id = this.inputs.push(result) - 1;

	result.media_conversion = this;
	result.input_id = id;

	return result;
});

/**
 * Create a new output stream
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @return   {Develry.MediaConversion.Output}
 */
Conversion.setMethod(function addOutput() {

	var result = new MC.Output(null, this),
	    id;

	// Add this to the inputs
	id = this.outputs.push(result) - 1;

	result.media_conversion = this;
	result.output_id = id;

	// Set strict to experimental by default
	result.setStrict(-2);

	return result;
});

/**
 * Return an output stream that will just decode the video,
 * emitted data will be in equally sized chunks of a single frame.
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {Number}   pixel_format
 *
 * @return   {Develry.MediaConversion.Output}
 */
Conversion.setMethod(function getRawFramesOutput(pixel_format) {

	var that = this,
	    output = this.addOutput(),
	    pledge = new Blast.Classes.Pledge(),
	    depth;

	if (!pixel_format) {
		pixel_format = 'rgb24';
	}

	// @TODO: get from -pix_fmts output
	switch (pixel_format) {
		case 'monob':
		case 'monow':
		case 'gray':
			depth = 1;
			break;

		default:
			depth = 3;
	}

	// Now override the _transform
	output._transform = MC.ChunkedStream.prototype._transform;

	// Set the needed arguments
	output.setVideoCodec('rawvideo');
	output.setFormat('data');
	output.addArguments('-map', 0);
	output.setDisableAudio(true);
	output.setPixelFormat(pixel_format);

	output.probeValue('video_size', function gotSize(err, size) {
		if (err) {
			return that.emit('error', err);
		}

		let pieces = size.split('x'),
		    width  = Number(pieces[0]),
		    height = Number(pieces[1]);

		// The "3" is only for rgb24, other formats should be added
		output.chunk_size = width * height * depth;

		pledge.resolve({
			chunk_size : output.chunk_size,
			width      : width,
			height     : height,
			depth      : depth
		});
	});

	// Store the chunk size as an override value
	output.override_probe_values.chunk_size = pledge;

	return output;
});

/**
 * Create a new MediaStream (mostly for outputs)
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  1.0.0
 */
Conversion.setMethod(function createStream() {

	var result = new MediaStream();

	// Attach this conversion instance
	result.media_conversion = this;

	return result;
});

/**
 * Set the niceness of the conversion
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Conversion.setMethod(function renice(niceness) {

	var args;

	if (this.niceness == niceness) {
		return;
	}

	if (typeof niceness == 'number') {
		this.niceness = niceness;
	}

	if (!this.process) {
		return;
	}

	args = [this.niceness, '-p', this.process.pid];
	ChildProcess.execFile('/usr/bin/renice', args);
});

/**
 * Get the arguments for the process
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Conversion.setMethod(function getArguments(options, callback) {

	var that = this,
	    result = [],
	    used_stdin,
	    used_stdout,
	    pipe = 2,
	    key;

	if (typeof options == 'function') {
		callback = options;
		options = {};
	}

	for (key in this.arguments) {
		if (this.arguments[key] == null) {
			continue;
		}

		result.push('-' + key);

		if (this.arguments[key] != '') {
			result.push(this.arguments[key]);
		}
	}

	result.push.apply(result, this.extra_arguments);

	Fn.parallel(function getInputArguments(next) {

		var tasks = [],
		    i;

		for (i = 0; i < that.inputs.length; i++) {
			let input = that.inputs[i];

			tasks.push(function getArguments(next) {
				input.getArguments(function gotArguments(err, args) {

					if (err) {
						return next(err);
					}

					if (input.source_stream) {

						if (!used_stdin) {
							input.pipe_number = 0;
							used_stdin = true;
						} else {
							input.pipe_number = pipe++;
						}

						args.push('-i', 'pipe:' + input.pipe_number);
					} else {
						args.push('-i', input.original_source);
					}

					next(null, args);
				});
			});
		}

		Fn.parallel(tasks, function gotInputArgs(err, args) {

			if (err) {
				return next(err);
			}

			next(null, Blast.Bound.Array.flatten(args));
		});
	}, function getOutputArguments(next) {

		var tasks = [],
		    i;

		for (i = 0; i < that.outputs.length; i++) {
			let output = that.outputs[i];

			tasks.push(function getArguments(next) {
				output.getArguments(function gotArguments(err, args) {

					if (err) {
						return next(err);
					}

					if (output.target_stream) {
						if (pipe == 2) {
							pipe++;
						}

						if (pipe < 1) {
							pipe = 1;
							used_stdout = true;
							output.pipe_number = 3;
						} else if (pipe > 1 && !used_stdout) {
							output.pipe_number = 1;
							used_stdout = true;
						} else {
							output.pipe_number = pipe++;
						}

						args.push('pipe:' + output.pipe_number);
					} else {
						args.push(output.original_target);
					}

					next(null, args);
				});
			});
		}

		Fn.parallel(tasks, function gotOutputArgs(err, args) {

			if (err) {
				return next(err);
			}

			next(null, Blast.Bound.Array.flatten(args));
		});
	}, function done(err, args) {

		if (err) {
			return callback(err);
		}

		result.push.apply(result, Blast.Bound.Array.flatten(args));

		callback(null, result);
	});
});

/**
 * Start the conversion
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  1.0.0
 *
 * @param    {Object}   options   Conversion options
 */
Conversion.setMethod(function start(options) {

	var that = this;

	if (!this.inputs.length) {
		throw new Error('No inputs are defined');
	}

	if (!this.outputs.length) {
		throw new Error('No outputs are defined');
	}

	let streams,
	    pledge,
	    stdio,
	    args,
	    path;

	pledge = Fn.series(function prepareInputStream(next) {

		var tasks = [],
		    i;

		that.debug('Preparing', that.inputs.length, 'inputs');

		for (i = 0; i < that.inputs.length; i++) {
			let input = that.inputs[i];

			tasks.push(function getSource(next) {
				input.getSource(next);
			});
		}

		Fn.parallel(tasks, next);
	}, function prepareOutputStreams(next) {

		var tasks = [],
		    i;

		that.debug('Preparing', that.outputs.length, 'outputs');

		for (i = 0; i < that.outputs.length; i++) {
			let output = that.outputs[i];

			if (output.target_stream) {
				continue;
			}

			tasks.push(function createDir(next) {
				that.createDir(libpath.dirname(output.original_target), function createdDir(err) {
					if (err) {
						return next(err);
					}

					next();
				});
			});
		}

		Fn.parallel(tasks, next);
	}, function getArguments(next) {

		that.debug('Getting arguments');

		that.getArguments(function gotArguments(err, got_args) {

			if (err) {
				return next(err);
			}

			args = got_args;
			next();
		});
	}, function setPipes(next) {

		var extra = -2,
		    i;

		that.debug('Mapping pipes');

		streams = that.getStreams();
		extra += streams.length;

		stdio = ['pipe', 'pipe', 'pipe'];

		for (i = 0; i < extra; i++) {
			stdio.push('pipe');
		}

		next();
	}, function getWorkingPath(next) {
		that.getWorkingPath(function gotPath(err, _path) {

			that.debug('Got working path:', _path);

			path = _path;
			next(err);
		});
	}, function doEncoding(next) {

		var entry,
		    proc,
		    i;

		that.debug('Spawning ffmpeg binary', that.ffmpeg_path);
		that.debug('With ffmpeg arguments', args);

		that.emit('arguments', args);

		proc = ChildProcess.spawn(that.ffmpeg_path, args, {
			cwd    : null,
			stdio  : stdio
		});

		// Store the process on the object
		that.process = proc;

		proc.on('exit', function onExit(code) {
			// FFMPEG has exited, need to wait on remuxer
			that.process = null;
			that.debug('FFmpeg exit code:', code)

			that.cleanup(code);
		});

		// The stdin of the process closes before
		// sending the correct close events,
		// so just ignore errors
		proc.stdin.on('error', function onStdinError(err) {
			// Ignore!
			that.debug('Stdin error:', err);
		});

		// Listen for errors
		proc.on('error', function onErr(err) {
			that.debug(err);
			that.cleanup(err);
		});

		// Handle StdErr messages (progress output)
		proc.stderr.on('data', function onStdErr(chunk) {
			that.debug(''+chunk);
			that._handleProgressOutput(chunk);
		});

		// Listen to the kill request
		proc.on('request-kill', function onRequestKill() {
			proc.kill();
		});

		// Set the niceness to 10 by default
		that.renice();

		// Emit the start event
		that.emit('start');

		// Link the streams
		for (i = 0; i < streams.length; i++) {
			entry = streams[i];

			if (entry.pipe_number != null) {
				if (entry.source_stream) {
					// Pipe input streams into FFmpeg
					entry.source_stream.pipe(proc.stdio[entry.pipe_number]);
					entry.source_stream.resume();
				} else if (entry.target_stream) {

					// Pipe FFmpeg output into our output streams
					proc.stdio[entry.pipe_number].pipe(entry.target_stream);
				}
			}
		}

	}, function done(err) {

		if (err) {
			throw err;
		}

	});

	return pledge;
});

/**
 * Get available formats & codecs
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {Function}   callback
 */
Conversion.setMethod(function getFormats(callback) {

	var that = this;

	if (!callback) {
		callback = Fn.thrower;
	}

	if (this._getting_formats) {
		return this.afterOnce('formats', function gotFormats() {
			callback(null, that._formats, that._codecs);
		});
	}

	this._getting_formats = true;

	if (fc_cache[this.ffmpeg_path]) {
		return Blast.nextTick(function fromCache() {
			that._formats = fc_cache[that.ffmpeg_path].formats;
			that._codecs = fc_cache[that.ffmpeg_path].codecs;

			that.emit('formats', that._formats, that._codecs);
			callback(null, that._formats, that._codecs);
		});
	}

	let format_lines,
	    codec_lines;

	Fn.parallel(function gotCodecs(next) {
		ChildProcess.execFile(that.ffmpeg_path, ['-codecs'], function done(err, stdout, stderr) {

			if (err) {
				return next(err);
			}

			codec_lines = String(stdout).split('\n').slice(10);
			next();
		});
	}, function getFormats(next) {
		ChildProcess.execFile(that.ffmpeg_path, ['-formats'], function done(err, stdout, stderr) {

			if (err) {
				return next(err);
			}

			format_lines = String(stdout).split('\n').slice(4);
			next();
		});
	}, function done(err) {

		if (err) {
			return callback(err);
		}

		let description,
		    result,
		    flags,
		    name,
		    line,
		    i;

		result = that._formats = {};

		for (i = 0; i < format_lines.length; i++) {
			line = format_lines[i];

			flags = line.slice(0, 3).trim();
			name = line.slice(3, 19).trim();
			description = line.slice(19).trim();

			if (!name) {
				continue;
			}

			result[name] = {
				name        : name,
				decoder     : flags.indexOf('D') > -1,
				encoder     : flags.indexOf('E') > -1,
				encoders    : {},
				decoders    : {},
				description : description
			};
		}

		let decoders,
		    encoders,
		    codecs = that._codecs = {},
		    entry,
		    j;

		for (i = 0; i < codec_lines.length; i++) {
			line = codec_lines[i];

			flags = line.slice(0, 7).trim();
			name = line.slice(7, 28).trim();
			description = line.slice(28).trim();

			if (!name) {
				continue;
			}

			decoders = /\(decoders: (.*?)\)/.exec(description);
			encoders = /\(encoders: (.*?)\)/.exec(description);

			if (decoders && decoders[1]) {
				decoders = decoders[1].trim().split(' ');
			} else {
				decoders = [];
			}

			if (encoders && encoders[1]) {
				encoders = encoders[1].trim().split(' ');
			} else {
				encoders = [];
			}

			entry = {
				name        : name,
				decoding    : flags.indexOf('D') > -1,
				encoding    : flags.indexOf('E') > -1,
				video       : flags.indexOf('V') > -1,
				audio       : flags.indexOf('A') > -1,
				subtitle    : flags[3] == 'S',
				intraframe  : flags.indexOf('I') > -1,
				lossy       : flags.indexOf('L') > -1,
				lossless    : flags[7] == 'S',
				decoders    : decoders,
				encoders    : encoders,
				description : description
			};

			codecs[name] = entry;

			for (j = 0; j < entry.decoders.length; j++) {
				name = entry.decoders[j];

				if (!that._formats[entry.name]) {
					continue;
				}

				that._formats[entry.name].decoders[name] = entry;
			}

			for (j = 0; j < entry.encoders.length; j++) {
				name = entry.encoders[j];

				if (!that._formats[entry.name]) {
					continue;
				}

				that._formats[entry.name].encoders[name] = entry;
			}
		}

		fc_cache[that.ffmpeg_path] = {
			codecs  : codecs,
			formats : that._formats
		};

		callback(null, that._formats, that._codecs);
		that.emit('formats', that._formats, that._codecs);
	});
});

/**
 * Handle process progress output
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {Buffer}   chunk
 */
Conversion.setMethod(function _handleProgressOutput(chunk) {

	var extract,
	    message,
	    temp,
	    info;

	if (this.stopped) {
		return;
	}

	message = String(chunk);

	if (message.indexOf('onversion failed') > -1) {
		return this.cleanup(new Error('Conversion failed: ' + this.last_error));
	}

	if (message.indexOf('o such file or') > -1) {
		return this.cleanup(new Error(message));
	}

	// Store this as the last error
	this.last_error = message;

	// "frame= 131 fps= 18 q=0.0 size=    0kb time=00:00:00 bitrate=N/A   \r"
	// ==> ["frame= 131 fps= 18 q=0.0 size=    0kb", "131", "18", "0.0", "0"]
	temp = /frame\=\W*(\d+) fps\=\W*(\d*\.?\d*) q=\W*(\d*\.?\d*) size=\W+(\d*\.?\d*)kb/i.exec(message);

	if (!temp) {

		if (message.indexOf('Metadata') > -1) {

			if (this.video_info == null) {
				// @todo: much improvements
				extract = /Stream #.* Video: (.+?) /.exec(message);

				if (extract && extract[0]) {
					this.video_info = extract[0];
					this.emit('input_codec', this.video_info);
				}
			}

			return;
		}

		if (message.indexOf('[lib') > -1) {
			return;
		}

		if (message.indexOf('Copyright') > -1) {
			return;
		}

		if (message.indexOf('Failed to initialize encoder') > -1) {
			return this.cleanup(new Error('Failed to initialize encoder'));
		}

		if (message.indexOf('Error reading log file') > -1) {
			this.seen_error = message;
		}

		if (message.indexOf('Invalid data') > -1) {
			return this.cleanup(new Error(message.trim()));
		}

		this.report('conversion_error', message);

		return;
	}

	info = {
		frame : Number(temp[1]),
		fps   : Number(temp[2]),
		q     : Number(temp[3]),
		size  : Number(temp[4]) * 1024
	};

	this.emit('progress', info);
});

/**
 * Get the streamable inputs & outputs
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 */
Conversion.setMethod(function getStreams() {

	var that = this,
	    result = [],
	    entry,
	    i;

	for (i = 0; i < that.inputs.length; i++) {
		entry = that.inputs[i];

		if (entry.pipe_number != null) {
			result.push(entry);
		}
	}

	for (i = 0; i < that.outputs.length; i++) {
		entry = that.outputs[i];

		if (entry.pipe_number != null) {
			result.push(entry);
		}
	}

	return result;
});

/**
 * Stop the conversion
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Conversion.setMethod(function stop(err) {

	// Only stop this once
	if (this.stopped) {
		return;
	}

	this.stopped = true;

	if (this.process) {
		this.process.emit('request-kill');
	}

	this.emit('end', err);

	if (err) {
		this.emit('error', err);
	}
});

/**
 * Emit conversion progress
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Conversion.setMethod(function report(name, value) {

	if (arguments.length == 1) {
		value = name;
		name = 'conversion';
	}

	this.emit(name, value);
});

/**
 * Get a path with free space
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Conversion.setMethod(function getStoragePath(callback) {
	callback(null, '/tmp/');
});

/**
 * Create a directory
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Conversion.setMethod(function createDir(path, callback) {
	mkdirp(path, callback);
});

/**
 * Set the strict value
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {String}   value
 */
Conversion.setArgument('strict', 'strict', function setStrict(value) {

	if (value === true || arguments.length == 0) {
		value = 'strict';
	} else if (value === false) {
		value = 'experimental';
	}

	return value;
});

/**
 * Register the webm profile
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  1.0.0
 *
 * @param    {Input}   input
 * @param    {Output}  output
 * @param    {Object}  options
 */
Conversion.registerProfile(function webm(input, output, options) {

	output.setAudioCodec('libvorbis');
	output.setVideoCodec('libvpx');
	output.setFormat('webm');

	// @TODO: re-add webm remuxing

	output.addArguments(
		'-qmin', 10,
		'-qmax', 40
	);

	// @TODO: add the webm-only cpu_used option?
});

/**
 * Register the mp3 profile
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  1.0.0
 *
 * @param    {Input}   input
 * @param    {Output}  output
 * @param    {Object}  options
 */
Conversion.registerProfile(function mp3(input, output, options) {
	output.setAudioCodec('libmp3lame');
	output.setFormat('mp3');
});

/**
 * Register the mp4 profile
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  1.0.0
 *
 * @param    {Input}   input
 * @param    {Output}  output
 * @param    {Object}  options
 */
Conversion.registerProfile(function mp4(input, output, options) {

	output.addArguments(
		'-profile:v', 'baseline',
		'-level', '3.0'
	);

	output.setAudioCodec('aac');
	output.setVideoCodec('libx264');
	output.setFormat('mp4');

	output.addArguments(
		'-movflags', 'isml+empty_moov+default_base_moof+frag_keyframe'
	);

	output.setAudioBsf('aac_adtstoasc');

	if (options && options.realtime) {
		output.addArguments('-x264opts', 'keyint=5:min-keyint=5:scenecut=-1');
	}
});

/**
 * Register the jsmpeg profile
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.1
 * @version  1.0.0
 *
 * @param    {Input}   input
 * @param    {Output}  output
 * @param    {Object}  options
 */
Conversion.registerProfile(function jsmpeg(input, output, options) {

	output.setVideoCodec('mpeg1video');
	output.setFormat('mpegts');
	output.setDisableAudio(true);

	output.addArguments(
		'-b:v', '1500k',
		'-bf', 0
	);
});

/**
 * Register the copy profile:
 * copy the video & audio streams,
 * mux them into a mpegts container by default
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  1.0.0
 *
 * @param    {Input}   input
 * @param    {Output}  output
 * @param    {Object}  options
 */
Conversion.registerProfile(function copy(input, output, options) {

	output.setAudioCodec('copy');
	output.setVideoCodec('copy');
	output.setFormat('mpegts');


	// Matroska can handle variable framerates just fine,
	// avi and such don't
	// @TODO: this might fix framerate issues,
	// it would totally break other things since
	// matroska is not as robust as a ts
	if (options && options.variable_framerate) {
		output.setFormat('matroska');
		input.setCopyTs(false);
		output.addArguments('-vsync', 2);
	}

	// @TODO: Only needed for mp4 streams
	output.addArguments('-bsf:v', 'h264_mp4toannexb');
});

/**
 * Return true if the input is a stream
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {Object}   input
 */
MC.isStream = function isStream(input) {

	if (!input || typeof input != 'object') {
		return false;
	}

	return typeof input.pipe == 'function';
};