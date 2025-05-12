# shared-rb-js

A real-time safe SPMC ring buffer backed by SharedArrayBuffer

```
❯ node bench/bench_rw.js

elapsed  |  writes (ops/s)  reads (ops/s)  drops (ops/s)  read%   drop%
5.00s |       12,699,070      12,699,069               0  100.0     0.0
```
