---
date: 2022-02-25 12:00
description: "Controlling the MaxxFan Deluxe over the Ethernet port"
tags: Electronics
image: MaxxFan.jpg
---

# Controlling a MaxxFan over Ethernet

I bought a [MaxxFan Deluxe](https://www.airxcel.com/rv/maxxair/products/fans/maxxfan-deluxe)
model `00-05100K` fan to install in my 1989 Winnebago
LeSharo.  I noticed that it has an RJ45 connector — commonly known as an
ethernet connector — on the circuit board, and wondered what it
was used for, but I couldn't find any useful info about it on the internet.

I thought it would be interesting to be able to control the fan with a
microcontroller or a custom remote, so I took the fan apart and started
investigating.

The process of the investigation is documented in this video:

(coming soon)

## MaxxFan Ethernet Port Wiring

The wires on the ethernet port[1](#footnotes) are connected directly to the
wires on the button panel of the fan, and can be used to duplicate the commands
of the buttons by connecting two of the wires.

Using [standard RJ45 pin wiring](https://www.showmecables.com/blog/post/rj45-pinout)
numbers, with `1` being on the left side when the bump is down, the wiring is as
follows:

| Button      | Pins        |
| ----------- | ----------- |
| Up          | 6, 8        |
| Down        | 5, 8        |
| Auto        | 4, 7        |
| In/Out      | 5, 7        |
| On/Off      | 6, 7        |

The MaxxFan Deluxe models `00-07000K` and `00-07500K` also include an auto-open
feature that is triggered by simultaneously triggering both the `Up` and `Down`
buttons.

There are other MaxxFan models with different button panels, such as the MaxxFan
Plus model that has a Rain Sensor button on its control panel. If you are aware
of any wiring differences on other models, [let me know](mailto:zef@zef.studio)
and I will update this post to reflect those.


## Electronics

To determine the wiring of the connector, I took apart the fan and inspected the
circuit board and control panel.

- ![Controlling a MaxxFan with an ESP8266 microcontroller | Controlling the fan with a microcontroller.](MaxxFan.jpg)
- ![MaxxFan Control Panel, lit from back | The traces in the control panel are visible when backlit.](control-panel-backlit.jpg)

- ![MaxxFan Circuit Board Top.](circuit-board-top.jpg)
- ![MaxxFan Circuit Board Bottom](circuit-board-bottom.jpg)

I had success using a simple NPN transistor circuit to control each button. This
can be wired as follows, using a resistor to connect the signal wire to the
base pin, and is detailed in the video above.

![Transistor as a switch](circuit-schematic.jpg)

1) I am using the term "ethernet" because it is known colloquially, but of
course the fan does not use the ethernet protocol, but rather simply utilizes
the cable and RJ45 connector because it's a cheap and easy way to get an
eight-wire connection.

