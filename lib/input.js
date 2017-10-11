const ChildProcess = require('child_process'),
      libpath      = require('path'),
      Blast        = __Protoblast,
      Obj          = Blast.Bound.Object,
      Fn           = Blast.Bound.Function,
      fs           = require('fs'),
      MC           = Fn.getNamespace('Develry.MediaConversion');

/**
 * The Input Class
 *
 * @constructor
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {String|Stream}   source
 */
var Input = Fn.inherits('Informer', 'Develry.MediaConversion', function Input(source, parent) {

	// Set input arguments
	this.arguments = {};

	// Optional extra argumants
	this.extra_arguments = [];

	if (parent) {
		this.parent = parent;
	}

	if (source) {
		this.setSource(source);
	}
});

/**
 * The parent MediaConversion instance
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @type     {Develry.MediaConversion.MediaConversion}
 */
Input.setProperty('parent', null);

/**
 * The input_id in the parent
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @type     {Number}
 */
Input.setProperty('input_id', null);

/**
 * The pipe_number to use
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @type     {Number}
 */
Input.setProperty('pipe_number', null);

/**
 * Flag maps
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @type     {Object}
 */
Input.setProperty('flag_map', {});

/**
 * Flag names
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @type     {Object}
 */
Input.setProperty('flag_name', {});

/**
 * Name maps
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @type     {Object}
 */
Input.setProperty('name_map', {});

/**
 * The original source parameter
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @type     {String|Stream}
 */
Input.setProperty('original_source', null);

/**
 * The source stream
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @type     {Stream}
 */
Input.setProperty('source_stream', null);

/**
 * True if it's an HTTP, RTSP, ... source
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @type     {Boolean}
 */
Input.setProperty('is_network_source', null);

/**
 * Should we make this stream live?
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @type     {Boolean}
 */
Input.setProperty('make_it_live', false);

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
Input.setStatic(function setArgument(name, flag, handler) {

	var that = this,
	    classified = Blast.Bound.String.camelize(name),
	    prev_flag,
	    cur_flag,
	    flag_fnc;

	if (typeof flag == 'function') {
		flag_fnc = flag;
	}

	// Store in the name map
	this.prototype.name_map[name] = classified;

	if (typeof flag == 'string') {
		this.prototype.name_map[name] = classified;
		this.prototype.flag_name[flag] = name;
	}

	this.prototype.flag_map[name] = function getter(self, ...args) {
		return self['get' + classified](...args);
	};

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
 * Set a certain argument that doesn't have any parameters
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {String}   name     The name of the argument
 * @param    {String}   flag     The flag to use in the command
 *
 * @return   {this}
 */
Input.setStatic(function setFlagArgument(name, flag) {

	this.setArgument(name, flag, function setFlagValue(val) {
		if (val || arguments.length == 0) {
			return '';
		}

		return null;
	});
});

/**
 * Set many options
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 */
Input.setMethod(function setMany(options) {

	var key;

	for (key in options) {
		this._setFlagOrName(key, options[key]);
	}
});

/**
 * Set many options
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 */
Input.setMethod(function _setFlagOrName(key, value) {

	var classified,
	    method,
	    temp;

	classified = this.name_map[key];

	if (!classified) {
		classified = Blast.Bound.String.camelize(key);
	}

	method = 'set' + classified;

	if (!this[method]) {
		method = 'add' + classified;
	}

	if (!this[method]) {
		temp = this.flag_name[key];

		console.log(key, temp);

		if (temp) {
			return this._setFlagOrName(temp, value);
		}
	}

	if (!this[method]) {
		throw new Error('Unknown input option "' + key + '"');
	}

	if (!Array.isArray(value)) {
		this[method](value);
	} else {
		this[method](...value);
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
Input.setMethod(function addArguments(...args) {

	var i;

	for (i = 0; i < args.length; i++) {
		this.extra_arguments.push(args[i]);
	}

	return this;
});

/**
 * Get the input arguments
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @return   {Array}
 */
Input.setAfterMethod('ready', function getArguments(callback) {

	var result = [],
	    key;

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

	Blast.nextTick(function doCallback() {
		callback(null, result);
	});
});

/**
 * Make it live
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {Boolean}   val   If it should be live [true]
 *
 * @return   {this}
 */
Input.setMethod(function setLive(val) {

	if (val == null) {
		val = true;
	}

	this.make_it_live = val;

	return this._checkFlow();
});

/**
 * Actually probe the stream
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 */
Input.setMethod(function getProbe() {

	var that = this;

	// Return existing probes
	if (this.probe) {
		return this.probe;
	}

	// See if this input stream has been probed before, and if it has, use that!
	if (this.source_stream && typeof this.source_stream.data == 'function') {
		let probe = this.source_stream.data('probe');

		if (probe) {
			this.probe = probe;
			return this.probe;
		}
	}

	this.parent.debug('Creating new Probe');

	// Create a new probe
	this.probe = new MC.Probe(this);

	// Initialize the probe
	this.getSource(function gotSource(err, source) {

		if (err) {
			return callback(err);
		}

		let multiplier,
		    fork;

		if (typeof source == 'string') {
			that.probe.setStream(source);
			return;
		}

		// Create a stream multiplier
		multiplier = new MC.StreamMultiplier(source, 'MediaProbe');

		// Overwrite the input stream with a new fork
		if (that.source_stream) {
			that.source_stream = multiplier.fork('ConversionStream');
			that.source = that.source_stream;

			// Now that we've overriden a new stream, check the flow again
			that._checkFlow();
		}

		// Set the stream
		that.probe.setStream(multiplier.fork('ProbeStream'));
	});

	this.emit('probe', this.probe);

	return this.probe;
});

/**
 * Make sure the stream liveliness is checked
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @return   {this}
 */
Input.setMethod(function _checkFlow() {

	// If there already is a stream, make sure it's flowing
	if (this.source_stream) {
		if (this.make_it_live) {
			this.parent.debug('Make it live! Resuming input stream');
			this.source_stream.resume();
		} else {
			this.parent.debug('Making sure input stream is paused');
			this.source_stream.pause();
		}
	}

	return this;
});

/**
 * Set the actual source
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {Object}   source
 *
 * @return   {this}
 */
Input.setMethod(function setSource(source) {

	// Set the original source
	this.original_source = source;

	if (typeof source == 'string') {

		// Get the first 4 characters
		let piece = source.slice(0, 4).toLowerCase();

		if (piece == 'http' || piece == 'rtsp' || piece == '/dev') {
			this.is_network_source = true;
		}
	}

	if (MC.isStream(source)) {
		this.source_stream = source;

		if (source.constructor == MC.Output) {
			this.from_mc_output = this._findOriginalSource(source);
		}
	}

	// Check the flow of the source (possible pause it)
	this._checkFlow();

	// Emit this new source
	this.emit('source', source);

	// And prepare the source
	this._makeReady();

	return this;
});

/**
 * Find the original source through any possible Multipliers
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {Object}   source
 *
 * @return   {Stream}
 */
Input.setMethod(function _findOriginalSource(source) {

	var result;

	if (!source.parent_multiplier) {
		return source;
	}

	if (source.parent_multiplier) {
		result = source.parent_multiplier.original_stream;

		// Recursively look upwards in case of more multipliers
		if (result) {
			result = _findOriginalSource(result);
		}
	}

	return result || source;
});

/**
 * Prepare the source
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @return   {this}
 */
Input.setMethod(function _makeReady() {

	var that = this,
	    codec;

	Fn.series(false, function getCodec(next) {
		that.probeValue('video_codec', function gotCodec(err, _codec) {
			codec = _codec;
			next(err);
		});
	}, function setSizes(next) {

		if (codec != 'rawvideo') {
			return next();
		}

		that.setFormat('rawvideo');

		Fn.parallel(false, function getFormat(next) {
			that.probeValue('pixel_format', function gotFormat(err, result) {

				if (err) {
					return next(err);
				}

				if (result) {
					that.setPixelFormat(result);
				} else {
					return next(new Error('Pixel format not found, can not process raw video'));
				}

				next();
			})
		}, function getResolution(next) {
			that.probeValue('video_size', function gotResolution(err, result) {
				if (err) {
					return next(err);
				}

				if (result) {
					that.setResolution(result);
				} else {
					return next(new Error('Video size not found, can not process raw video'));
				}

				next();
			});
		}, function getFramerate(next) {
			that.probeValue('framerate', function gotFramerate(err, result) {

				if (err) {
					return next(err);
				}

				if (result) {
					that.setFramerate(result);
				} else {
					return next(new Error('Framerate not found, can not process raw video'));
				}

				next();
			});
		}, next);

	}, function done(err) {

		if (err) {
			return that.emit('error', err);
		}

		that.emit('ready');
	});
});

/**
 * Probe (or get) the video codec
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 */
Input.setMethod(function probeVideoCodec(callback) {

	var that = this;

	Blast.nextTick(function onNextTick() {

		var result = that.getVideoCodec();

		if (result) {
			return callback(null, result);
		}

		callback(null);
	});
});

/**
 * Probe (or get) a certain information
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {String}   name   The value to look for
 * @param    {Function} callback
 */
Input.setMethod(function probeValue(name, callback) {

	var that = this,
	    value;

	Fn.series(function checkFromOutput(next) {
		if (!that.from_mc_output) {
			return next();
		}

		// Only probe when it says it's ready!
		// Some values are set during the _makeReady call
		that.from_mc_output.events.afterOnce('ready', function outputReady() {
			that.from_mc_output.probeValue(name, function gotOutputValue(err, val) {
				value = val;
				next(err);
			});
		});
	}, function checkLocal(next) {

		if (value != null) {
			return next();
		}

		if (that.flag_map[name]) {
			value = that.flag_map[name](that);
		}

		if (value) {
			return callback(null, value);
		}

		that.parent.debug('Creating probe for value', name);

		let probe = that.getProbe();

		probe.getValue(name, function gotValue(err, val) {
			that.parent.debug('Probe found value', name, ':', val);
			value = val;
			next(err);
		});
	}, function done(err) {
		callback(err, value);
	})
});

/**
 * Probe for multiple vlaues
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {Array}    names   The values to look for
 * @param    {Function} callback
 */
Input.setMethod(function probeValues(names, callback) {

	var that = this,
	    tasks = {};

	names.forEach(function eachName(name) {
		tasks[name] = function doProbe(next) {
			that.probeValue(name, next);
		};
	});

	Fn.parallel(false, tasks, callback);
});

/**
 * Get the source
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {Function}   callback
 *
 * @return   {this}
 */
Input.setMethod(function getSource(callback) {

	var that = this;

	if (this.source) {
		return Blast.nextTick(function alreadyGotSource() {
			return callback(null, that.source);
		});
	}

	if (typeof this.original_source == 'function') {
		return this.original_source(function gotSource(err, source) {

			if (err) {
				return callback(err);
			}

			if (MC.isStream(source)) {
				that.source_stream = source;
				that._checkFlow();
			}

			setSource();
		});
	}

	Blast.nextTick(setSource);

	function setSource() {

		if (!that.original_source) {
			return callback(new Error('No source has been set'));
		}

		if (that.source_stream) {
			that.source = that.source_stream;
		} else {
			that.source = that.original_source;
		}

		callback(null, that.source);
	}

	return this;
});

/**
 * Destroy this input
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 */
Input.setMethod(function destroy() {

	if (!this.source_stream) {
		return;
	}

	// Make sure the input stream don't remain paused
	this.source_stream.resume();

	if (this.source_stream.destroy) {
		this.source_stream.destroy();
	} else if (this.source_stream.end) {
		this.source_stream.end();
	}
});

/**
 * Set the input format, if it is known
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {String}   format
 */
Input.setArgument('format', 'f');

/**
 * Set the input framerate, if it is known
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {Number}   fps
 */
Input.setArgument('framerate', 'r');

/**
 * Set the input resolution, if it is known
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {String}   resolution
 */
Input.setArgument('resolution', 'video_size');

/**
 * Set the input duration
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {Number|String}   duration
 */
Input.setArgument('duration', 't', function setDuration(duration) {

	// Numbers are seconds, strings are in the HH:MM:SS notation
	if (typeof duration == 'string') {
		if (!isNaN(duration)) {
			duration = Number(duration);
		}
	}

	return duration;
});

/**
 * Set the loop
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {Boolean}   loop
 */
Input.setArgument('loop', 'stream_loop', function setLoop(loop) {

	if (loop === true) {
		return -1;
	}

	if (!loop) {
		return 0;
	}

	return loop;
});

/**
 * Set the video codec
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {String}   codec
 */
Input.setArgument('video_codec', 'c:v');

/**
 * Set the audio codec
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {String}   codec
 */
Input.setArgument('audio_codec', 'c:a');

/**
 * Seek to the given position (inaccurate)
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {String|Number}   position
 */
Input.setArgument('seek', 'ss');

/**
 * Set the pixel format
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {String}   format
 */
Input.setArgument('pixel_format', 'pix_fmt');

/**
 * Set SwScaler flags
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {String}   flags
 */
Input.setArgument('sw_scaler_flags', 'sws_flags');

/**
 * Use hardware acceleration to decode:
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {String}   hwaccel
 */
Input.setArgument('hardware_accelleration', 'hwaccel', function setHwaccel(hwaccel) {

	switch (hwaccel) {

		case null:
			break;

		case 'none':
		case 'auto':
		case 'vda':
		case 'vdpau':
		case 'dxva2':
		case 'vaapi':
		case 'qsv':
			break;

		default:
			throw new TypeError('Invalid hardware accelleration method "' + hwaccel + '"');
	}

	return hwaccel;
});

/**
 * Use hardware acceleration to decode
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {String}   hwaccel_device
 */
Input.setArgument('hardware_accelleration_device', 'hwaccel_device');

/**
 * Read input at native frame rate
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {Boolean}   val
 */
Input.setFlagArgument('native_framerate', 're');

/**
 * Do not process input timestamps,
 * but keep their values without trying to sanitize them
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {Boolean}   val
 */
Input.setFlagArgument('copy_ts', 'copyts');

/**
 * Indicate this has a variable framerate
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {Boolean}   val
 */
Input.setArgument('variable_framerate', 'use_wallclock_as_timestamps', function setVariable(val) {
	if (val) {
		return '1';
	} else {
		return null;
	}
});