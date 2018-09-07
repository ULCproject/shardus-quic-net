const quic             = require('node-quic')
const ArbitraryPromise = require('arbitrary-promise')
const net              = require('net')

const MAX_QUIC_DATA_SIZE = 50000

let netServer = null

/* We basically want to monkey patch quic to include a TCP option */

const send = async (port, address, data) => {
  // as in ulc-node-quic, data must be an object. Assumed to be so.
  const stringifiedData = JSON.stringify(data)
  const dataSize = stringifiedData.length

  if (dataSize < MAX_QUIC_DATA_SIZE) return quic.send(port, address, stringifiedData)

  const promise = new ArbitraryPromise([['resolve', 'then'], ['reject', 'onError']])

  const client = new net.Socket()

  client.on('error', e => promise.reject(e))
  client.on('close', () => client.destroy())
  client.on('end', () => client.destroy())

  let buffer

  client.on('data', dat => {
    if (buffer) buffer = Buffer.concat([buffer, dat])
    else buffer = dat
  })

  client.connect(port, address, () => {
    client.write(stringifiedData, () => client.end())
  })

  return promise
}

// quic server session.SessionState.{remoteAddress,remotePort}
// net, on socket.on('end'), just log socket.remotePort and socket.remoteAddress

// TODO note handleData takes the data and then a function write()
const listen = (port, address = 'localhost') => {

  const promise = new ArbitraryPromise([['resolve', 'then'], ['error', 'onError'], ['handleData', 'onData']])

  const readyPromise = new ArbitraryPromise([['resolve', 'then'], ['reject', 'catch']])

  // keep track of how many are ready. When each is ready, it'll add one here.
  // Once this is 2, we'll be done.
  let numReady = 0

  // TODO if we don't write back, don't allow half open
  netServer = net.createServer({ allowHalfOpen: true }, socket => {
    socket.on('error', e => promise.error(e))

    let data

    socket.on('data', dat => {
      if (data) data = Buffer.concat([data, dat])
      else data = dat
    })

    socket.on('end', () => {
      const remote = {
        port: socket.remotePort,
        address: socket.remoteAddress
      }

      // necessary b/c of the allowHalfOpen bit.
      socket.end()

      promise.handleData(JSON.parse(data.toString()), remote)

    })
  })

  netServer.listen(port, address, () => {
    numReady += 1
    if (numReady === 2) readyPromise.resolve()
  })

  quic.listen(port, address)
    .onError(promise.error)
    .then(() => {
      numReady += 1
      if (numReady === 2) readyPromise.resolve()
    })
    .onData((data, stream) => {
      // Yanking a symbol off an object is not a great thing, but the implementation
      // does offer a way to access the remote port / address otherwise :/
      const sessionState = stream.session[Object.getOwnPropertySymbols(stream.session)[4]]

      const remote = {
        port: sessionState.remotePort,
        address: sessionState.remoteAddress
      }

      data = JSON.parse(data)

      promise.handleData(data, remote)
    })

  readyPromise.then(promise.resolve())
  return promise
}

const stopListening = () => {
  let numStopped = 0

  const promise = new ArbitraryPromise([['resolve', 'then'], ['reject', 'catch']])

  quic.stopListening().then(() => {
    numStopped += 1
    if (numStopped === 2) promise.resolve()
  })

  netServer.close(err => {
    if (err) return promise.reject(err)
    numStopped += 1
    if (numStopped === 2) promise.resolve()
  })

  return promise
}

module.exports = { send, listen, stopListening, MAX_QUIC_DATA_SIZE }
