# ONVIF2MQTT

This project can be used to connect to IP-camera's supporting ONVIF events and publish all reported events to an MQTT broker.

## Installing and running

```shell
# clone repository
$ git clone https://github.com/robertklep/onvif2mqtt
$ cd onvif2mqtt

# create a configuration file from the provided example
$ cp config.example.yml config.yml
$ vi config.yml

# (optional) edit docker-compose.yml
$ vi docker-compose.yml

# create Docker image
$ docker-compose build

# start Docker container in detached mode
$ docker-compose up -d
```

For the first run and/or to test the configuration, enable the `DEBUG` environment variable in `docker-compose.yml` and run the container in attached mode (by not using `-d`).

## MQTT topics

MQTT topics used (assuming the default `onvif2mqtt` prefix):
* `onvif2mqtt/status`: retained message that holds the current online/offline status of ONVIF2MQTT
* `onvif2mqtt/camera/CAMERA/info`: published when connection to camera is established, contains device information
* `onvif2mqtt/camera/CAMERA/event/EVENT`: published when `EVENT` occurs on `CAMERA`. The name of the event, and its value, will be camera-dependent.
* `onvif2mqtt/camera/CAMERA/event`: JSON-string with event information

## Configuration

See `config.example.yml` for an example configuration file.
