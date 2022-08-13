FROM redislabs/redisgraph:latest as redisgraph
FROM eqalpha/keydb:latest as db

ENV LD_LIBRARY_PATH /usr/lib/redis/modules
ENV REDISGRAPH_DEPS libgomp1

WORKDIR /data
RUN apt-get update -qq
RUN apt-get upgrade -y
RUN apt-get install -y --no-install-recommends ${REDISGRAPH_DEPS};
RUN rm -rf /var/cache/apt

COPY --from=redisgraph ${LD_LIBRARY_PATH}/redisgraph.so ${LD_LIBRARY_PATH}

CMD [ "--loadmodule", "/usr/lib/redis/modules/redisgraph.so"]

###############################################################################
FROM rust:1.63-alpine as builder

RUN apk add --no-cache musl-dev

WORKDIR /usr/src/myapp
COPY . .

RUN cargo install --path .

FROM rust:1.63-alpine as app

WORKDIR /usr/src/myapp
COPY --from=builder /usr/local/cargo/bin/ezsyslog /usr/local/bin/ezsyslog

CMD ["ezsyslog"]
