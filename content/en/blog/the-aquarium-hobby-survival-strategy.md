---
title: "The Aquarium Hobby: It's Not a Philosophy, It's a Survival Strategy (DIY Edition). 😅"
date: 2026-01-05
draft: false
description: "A personal take on the aquarium hobby as a DIY survival strategy, detailing the creation of HydroSense, an open-source IoT system for smart aquarium control, starting from old hardware to a full-fledged project roadmap."
tags: ["aquariums", "DIY", "IoT", "home-automation", "makers", "raspberry-pi", "open-source", "devops"]
featured_image: "/images/blog/aquarium-hobby-diy/header.png"
---

A few holiday days, some free time, and a couple of conversations were enough to reach a simple conclusion: aquarists are, to a large extent, makers and DIY enthusiasts. With today’s prices of aquarium equipment, that’s no longer a philosophy but it’s an economic journey started innocently: I wanted a trendy backlit aquarium background. Then I remembered the legendary drawer of useful junk:

A 10+ year old Raspberry Pi
An almost equally old LED strip
A soldering iron
And those famous last words: "This will be quick."

It wasn't quick. But it did turn into a full-fledged IoT project. That's how HydroSense was born - an opensource system for controlling aquarium lighting and peripherals, built like a product, not a one-off hack.

## What already works (and is fully open-source):

✔️ FastAPI backend with full API docs (Swagger / Redoc)

✔️ Sunrise & sunset simulation (based on GPS location and seasonality) 

✔️ Biotope profiles

✔️ Bidirectional Home Assistant integration (via MQTT)

✔️ Temperature sensor support

✔️ Ready integration with an automatic fertilizer doser

## What's next in the queue (Roadmap):

➡️ "Smartifying" old aquarium lights and filters

➡️ Integrating legacy aquarium computers with pH sensors

➡️ CO₂ dosing controlled by real measurements, not just timers

The project is public and open-source, because DIY plus solid architecture scales better than yet another vendor lock-in.

Sometimes the best projects start with cleaning out a drawer. And end with a roadmap!

You can find the repository here:👉 [https://github.com/tomasz-wostal-eu/hydro-sense](https://github.com/tomasz-wostal-eu/hydro-sense)
