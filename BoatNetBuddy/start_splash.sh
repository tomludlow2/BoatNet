#!/bin/bash

# Stop services that might interfere
sudo systemctl stop dnsmasq hostapd dhcpcd

# Disable NetworkManager control of wlan0
sudo nmcli dev set wlan0 managed no

# Release any DHCP bindings
sudo dhclient -r wlan0

# Bring down wlan0 and flush settings
sudo ip link set wlan0 down
sudo ip addr flush dev wlan0

# Kill any process using DHCP port 67
for pid in $(sudo ss -lupn | grep :67 | awk '{print $7}' | cut -d',' -f2 | cut -d'=' -f2); do
    sudo kill $pid
done

# Bring wlan0 up and set IP
sudo ip link set wlan0 up
sudo ip addr add 192.168.50.1/24 dev wlan0

# Enable IPv4 forwarding
sudo sysctl -w net.ipv4.ip_forward=1

# Set wlan0 to AP mode
sudo iw dev wlan0 set type __ap

# Start dnsmasq with manual settings
sudo dnsmasq --interface=wlan0 --dhcp-range=192.168.50.10,192.168.50.100,255.255.255.0,24h --dhcp-option=3,192.168.50.1 --dhcp-option=6,8.8.8.8,8.8.4.4

# Start hostapd
sudo hostapd -dd /etc/hostapd/hostapd.conf

# Configure dnsmasq to redirect all web traffic to splash page
sudo bash -c 'echo "address=/#/192.168.50.1" >> /etc/dnsmasq.conf'

# Restart services
sudo systemctl restart dnsmasq
sudo systemctl restart nginx

# Output success
echo "Access Point started with splash page at http://192.168.50.1"

