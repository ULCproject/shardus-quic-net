/* eslint-env mocha */
import { expect } from 'chai'
import fs from 'fs'
import path from 'path'
import snqh from '../src/index'

const PORT = 1234
const ADDRESS = '127.0.0.1'

describe('snqh', () => {
  describe('top level object', () => {

    it('has `listen` function', () => {
      expect(snqh.listen).to.be.a.function
    })

    it('has `stopListening` function', () => {
      expect(snqh.stopListening).to.be.a.function
    })

    it('has `send` function', () => {
      expect(snqh.send).to.be.a.function
    })

  })

  const data = [
    {
      name: 'a small object',
      data: { bobs: 'your uncle!' }
    },
    {
      name: 'a big object',
      data: { bigData: 'b'.repeat(snqh.MAX_QUIC_DATA_SIZE) }
    },
    {
      name: 'a small string',
      data: 'this here is a string!'
    },
    {
      name: 'a big string',
      data: 'a'.repeat(snqh.MAX_QUIC_DATA_SIZE + 5)
    },
    {
      name: 'a small integer',
      data: 2342455
    },
    {
      name: 'a big integer',
      data: 23424559237872659374923782849264782379479256877592834729569247472383
    },
    {
      name: 'a float',
      data: 1234.532432
    }
  ]

  data.forEach(datum => {

    describe(`when sending ${datum.name}`, () => {

      let receivedData = null
      let receivedRemote = null

      beforeEach(done => {
        snqh.listen(PORT, ADDRESS)
          .then(() => snqh.send(PORT, ADDRESS, datum.data))
          .onData((data, remote) => {
            receivedData = data
            receivedRemote = remote
            done()
          })
      })

      afterEach(async () => {
        receivedData = receivedRemote = null
        await snqh.stopListening()
      })

      it('receives correct data', () => {
        expect(receivedData).to.deep.eq(datum.data)
      })

      it('receives correct address', () => {
        expect(receivedRemote.address).to.eq('127.0.0.1')
      })

      it('receives numerical port', () => {
        expect(receivedRemote.port).to.be.a('number')
      })
    })
  })
})
