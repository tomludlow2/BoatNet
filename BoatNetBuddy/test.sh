#!/bin/bash

sudo nmcli dev set wlan0 managed yes

sudo nmcli radio wifi off && sudo nmcli radio wifi on

sudo nmcli dev wifi rescan

sudo nmcli dev wifi list --rescan no

sudo nmcli dev wifi connect "FANTASTIC GUEST" password "welcomehome"
