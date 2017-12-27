'use strict'

const fs = require('fs'),
  _ = require('lodash'),
  elasticsearch = require('elasticsearch'),
  async = require('async'),
  mapping = require('./_mapping.json')

function recreate(me, es, o, callback) {
  let body = []
  me.dummyData.forEach(function (item) {
    body.push({ index: { _id: item._id }})
    body.push(_.omit(item, ['_id']))
  })
  es.deleteByQuery({
    index: me[o].index,
    body: {
      query: {
        match_all: {}
      }
    }
  }, function(err, resp) {
    es.bulk({
      index: me[o].index,
      type: 'doc',
      refresh: 'true',
      body: body
    }, function (err, resp) {
      es.indices.refresh({
        index: me[o].index
      }, function (err, resp) {
        if (err) return callback(err)
        callback()                
      })
    })
  })
}

module.exports = {
  _: _,
  options: {
    hosts: ['localhost:9200'],
    index: 'test'
  },
  options1: {
    hosts: ['localhost:9200'],
    index: 'test1'
  },
  dummyData: [
    { _id: 'jack-bauer', name: 'Jack Bauer' },
    { _id: 'james-bond', name: 'James Bond' }
  ],
  bulkDocs: [
    { _id: 'jack-bauer', name: 'Jack Bauer' },
    { _id: 'johnny-english', name: 'Johnny English' },
    { name: 'Jane Boo' }
  ],
  timeout: 5000,
  resetDb: function (callback) {
    let me = this

    async.mapSeries(['options', 'options1'], function(o, callb) {
      let es = new elasticsearch.Client(_.cloneDeep(me[o]))
      es.indices.exists({
        index: me[o].index      
      }, function (err, resp) {
        if (resp) return recreate(me, es, o, callb)
        es.indices.create({
          index: me[o].index,
          body: mapping
        }, function (err, resp) {
          if (err) return callb(err)
          recreate(me, es, o, callb)
        })
      })
    }, callback)
  }
}