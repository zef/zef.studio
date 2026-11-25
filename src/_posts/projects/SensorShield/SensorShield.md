---
date: 2026-11-25 07:00
description: "A small open-source board that puts a sensor under a WEMOS mini ESP board, for ESPHome."
tags: electronics
image: SensorShield.jpg
---

# SensorShield

SensorShield is a small circuit board that puts a sensor right under a WEMOS
mini-format ESP board. Plug the pair into USB and, with
[ESPHome](https://esphome.io), it reports temperature, humidity, pressure, air
quality or CO₂ to Home Assistant over Wi-Fi.

The design is open, and made for parts that are cheap and easy to find: any of
three WEMOS mini boards, and the common hobby sensors. The bare board and the
parts that go with it are in the [store](https://store.zef.studio/sensorshield/).

- ![SensorShield with a BME280 under an S2 Mini, plugged into USB](SensorShield.jpg "A BME280 under an S2 Mini.")
- ![Bare SensorShield boards beside an S2 Mini and a BME280](boards.jpg "Bare boards, an S2 Mini and a BME280.")
- ![The top of the board](render-top.png "Top")
- ![The bottom of the board](render-bottom.png "Bottom")

## Boards

The footprint is the WEMOS D1 Mini's, so any board in that format fits:

| Board | Chip | Notes |
| --- | --- | --- |
| S2 Mini | ESP32-S2 | Recommended. USB-C. |
| C3 Mini | ESP32-C3 | Adds Bluetooth LE. |
| D1 Mini | ESP8266 | I2C sensors only: see below. |

## Sensors

One sensor per board, in any of these positions:

| Sensor | Measures | Wiring |
| --- | --- | --- |
| BME280 | temp, humidity, pressure | I2C |
| BME680 | BME280 + VOC gas | I2C |
| BMP280 | temp, pressure | I2C |
| DS18B20 | temp | data |
| DHT22, DHT11 | temp, humidity | data |
| SCD-41 | CO₂, temp, humidity | I2C |

The data-line sensors need the 4.7k pull-up resistor. The SCD-41 is
Adafruit's breakout.

The BME and BMP breakouts come in 3.3 V and 5 V versions: match the pin row to
your breakout. A DS18B20 can be soldered straight onto the board, or a
waterproof probe can go into a 3-pin screw terminal, at either 0.1 in or 0.2 in
pitch. The DHT sensors face outward from the edge of the board. Other sensors
work too, as long as their pins line up with one of the rows.

## Pins

| Signal | WEMOS pin | S2 Mini GPIO |
| --- | --- | --- |
| SDA | D2 | 33 |
| SCL | D1 | 35 |
| DATA | A0 | 3 |

On the D1 Mini, A0 is an analog-only input, so the data-line sensors (DS18B20
and DHT) need an S2 or C3 Mini. I2C sensors work on all three.

## Assembly

All through-hole, so it needs only a soldering iron:

1. Solder the sensor, and the 4.7k resistor if the sensor needs one.
2. Clip the sensor's pins flush so they fit under the WEMOS board.
3. Solder the WEMOS board on top.

## ESPHome

A starting point for an S2 Mini with a BME280:

```yaml
esphome:
  name: sensorshield

esp32:
  board: lolin_s2_mini

wifi:
  ssid: !secret wifi_ssid
  password: !secret wifi_password

api:
logger:

i2c:
  sda: GPIO33
  scl: GPIO35

sensor:
  - platform: bme280_i2c
    address: 0x76
    temperature:
      name: Temperature
    pressure:
      name: Pressure
    humidity:
      name: Humidity
```

For a DS18B20 instead, replace the `i2c` and `sensor` sections:

```yaml
one_wire:
  - platform: gpio
    pin: GPIO3

sensor:
  - platform: dallas_temp
    name: Temperature
```

## Parts

The [store page](https://store.zef.studio/sensorshield/) sells the bare board,
and the parts as add-ons at cost plus 25%, for anyone who'd rather not buy a
pack of ten. Every part is a commodity, and the store page links to places to
buy each one.
