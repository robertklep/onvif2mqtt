const fs                   = require('node:fs/promises');
const { promisify }        = require('node:util');
const { join }             = require('node:path');
const { parse : urlParse } = require('node:url');
const { EventEmitter }     = require('events');
const MQTT                 = require('async-mqtt');
const YAML                 = require('yaml');
const { Cam }              = require('onvif');
const debug                = require('debug')('onvif2mqtt');
const delay                = ms => new Promise(resolve => setTimeout(resolve, ms));

void async function() {
  // read config file
  const config = YAML.parse( await fs.readFile(join(__dirname, 'config.yml'), 'utf-8') );

  // quick-validate configuration
  if (! config.mqtt)    throw Error('[config.yml] missing `mqtt` configuration');
  if (! config.cameras) throw Error('[config.yml] missing `cameras` configuration');

  // if MQTT config is a string, parse it
  if (typeof config.mqtt === 'string') {
    config.mqtt = urlParse(config.mqtt);
    config.mqtt.base_topic = config.mqtt.pathname?.substring(1);
    if (config.mqtt.auth) {
      config.mqtt.username = config.mqtt.auth.split(':')[0];
      config.mqtt.password = config.mqtt.auth.split(':')[1];
    }
  }

  // connect to MQTT server
  const baseTopic = config.mqtt.base_topic || 'onvif2mqtt';
  const mqtt      = await MQTT.connectAsync({
    ...config.mqtt,
    will : {
      topic:   join(baseTopic, 'status'),
      payload: 'offline',
      retain:  true
    }
  });
  debug(`connected to MQTT server`);

  // set connection state to LWT topic
  await mqtt.publish(join(baseTopic, 'status'), 'online', { retain : true });

  // connect to all configured cameras
  for (const [ name, cameraConfig ] of Object.entries(config.cameras)) {
    const states = {};
    const prefix = join(baseTopic, 'camera', name);
    new CameraHandler(cameraConfig).on('event', ev => {
      const { type, state } = ev;
      debug(`camera '${ name }' event:`, ev);

      // only publish if state has changed
      if (state === states[type]) return;
      states[type] = state;

      // publish event data
      mqtt.publish(join(prefix, 'event'), JSON.stringify({
        source:    name,
        type:      type,
        state:     state,
        timestamp: new Date()
      }));
      mqtt.publish(join(prefix, 'event', type), JSON.stringify(state));
    }).on('disconnect', () => {
      debug(`camera '${ name }' disconnected`);
      mqtt.publish(join(prefix, 'status'), 'offline', { retain : true });
    }).on('connect', info => {
      debug(`camera '${ name }' connected`);
      mqtt.publish(join(prefix, 'status'), 'online', { retain : true });
      mqtt.publish(join(prefix, 'info'), JSON.stringify(info));
    }).on('connect.error', err => {
      debug(`camera '${ name }' failed to connect:`, err);
    });
  }
}();

class CameraHandler extends EventEmitter {
  constructor(config) {
    super();
    this.handleCamera(new Cam({ ...config, autoconnect : false }));
  }

  handleCamera(cam) {
    const getDeviceInformation = promisify(cam.getDeviceInformation).bind(cam);
    let connected              = false;
    let deviceInfo             = null;

    cam.connect(async err => {
      if (err) {
        this.emit('connect.error', err);
        // delay for a bit and try again
        await delay(10000);
        return process.nextTick(() => {
          this.handleCamera(cam);
        });
      }

      if (! deviceInfo) {
        deviceInfo = await getDeviceInformation();
      }
      this.emit('connect', deviceInfo);
      connected = true;

      // start 'keep-alive'
      setInterval(() => {
        cam.getSystemDateAndTime(err => {
          if (err && connected) {
            connected = false;
            this.emit('disconnect');
          } else if (! err && ! connected) {
            connected = true;
            this.emit('connect', deviceInfo);
          }
        });
      }, 10000);

      cam.on('event', message => {
        const type = message?.topic?._?.replace(/.*\//, '');
        if (! type || ! type.length) return;
        const state = message.message.message.data.simpleItem.$.Value;
        this.emit('event', { type, state });
      });
    });
  }
}
