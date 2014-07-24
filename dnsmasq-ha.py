# !/usr/bin/env python

# dnsmasq failover (keepalived)
# Author: jiasir (Taio Jia) <jiasir@icloud.com>
# Source code: https://github.com/nofdev/dnsmasq-ha
# License: The MIT license


import os
import sys
import shutil
from command import Command

command = Command()


def usage():
	print 'Usage: sudo python dnsmasq-ha.py [master|backup]'


def update_apt_source():
	print 'Waiting for apt source update...'
	command.execute('sudo', 'apt-get', 'update')


def install_dnsmasq():
	print 'Install dnsmasq...'
	command.execute('sudo', 'apt-get', '-y', 'install', 'dnsmasq')


def install_keepalived(role):
	if role == 'master':
		print 'Install dnsmasq as a master node...'
		command.execute('sudo', 'apt-get', '-y', 'install', 'keepalived')
		shutil.copy('conf/keepalived.conf.master', '/etc/keepalived/keepalived.conf')
	if role == 'backup':
		print 'Install dnsmasq as a backup node...'
		command.execute('sudo', 'apt-get', '-y', 'install', 'keepalived')
		shutil.copy('conf/keepalived.conf.backup', '/etc/keepalived/keepalived.conf')


def main():
	update_apt_source()

	if len(sys.argv) > 1:
		option = sys.argv[1]
	if option == "master":
		install_dnsmasq()
		install_keepalived('master')
		print 'Done.'
	elif option == "backup":
		install_dnsmasq()
		install_keepalived('backup')
		print 'Done'
	else:
		usage()


if __name__ == '__main__':
	if os.getuid() == 0:
		main()
	else:
		print 'You do not have permission!!'
		usage()
		exit()