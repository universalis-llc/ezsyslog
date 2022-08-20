# EZsyslog

A very simple syslog server that stores all data in a redis graph.

### Configuring Netconsole

Not working yet.

https://www.kernel.org/doc/html/latest/networking/netconsole.html

#### Built-in
Ensure your kernel is built with `CONFIG_NETCONSOLE=y`, not as a module (`CONSOLE_NETCONSOLE=m`) to use this method.

### Configuring Syslog

#### Busybox syslogd

Ensure the `-R` flag is used to specify the remote target server such as `syslogd -t -R <ip-address>:<port>`. For example `syslogd -t -R 192.168.1.53:514`.

#### syslog-ng

TODO

#### rsyslog

TODO