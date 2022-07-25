#!/bin/sh
set -e

# RFC3164
echo "<14>Nov 11 16:05:33 MYSERVER-M LogParser:The service was started." | socat - udp:localhost:9594
echo "May 11 10:00:39 scrooge SG_child[808]: [ID 748625 user.info] m:WR-SG-SUMMARY c:X  vhost:iscrooge61.seclutions.com:80 (http) GET / => http://bali/ , status:200 , redirection URL:<n/a> , referer:<n/a> , mapping:bali , request size: 421 , backend response size: 12960 , audit token:- , time statistics (microseconds): [request total 16617 , allow/deny filters 1290 , backend responsiveness 11845 , response processing 1643 , ICAP reqmod <n/a> , ICAP respmod <n/a> ] timestamp: [2012-05-11 10:00:39] [ rid:T6zHJ38AAAEAAAo2BCwAAAMk sid:910e5dd02df49434d0db9b445ebba975 ip:172.18.61.2 ]" | socat - udp:localhost:9594
echo "Apr 10 14:10:01.052: %MESKING-5-UPDOWN: Line protocol on Interface FastEthernet0/0, changed state to down" | socat - udp:localhost:9594
echo "May 11 10:40:48 scrooge disk-health-nurse[26783]: [ID 702911 user.error] m:SY-mon-full-500 c:H : partition health measures for /var did not suffice - still using 96% of partition space" | socat - udp:localhost:9594
# RFC5424
echo "<165>1 2003-10-11T22:14:15.003Z mymachine.example.com evntslog - ID47 [example'\"1\"'SDID@32473 iut=\"3\" eventSource=\"Application\" eventID=\"1011\"] BOMAn application event log entry..." | socat - udp:localhost:9594
echo "<34>1 2003-10-11T22:14:15.003Z mymachine.example.com su - ID47 - BOM'su root' failed for lonvick on /dev/pts/8" | socat - udp:localhost:9594
