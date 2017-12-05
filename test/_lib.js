'use strict'

const fs = require('fs'),
  _ = require('lodash'),
  elasticsearch = require('elasticsearch'),
  mapping = require('./_mapping.json')

function recreate(me, es, callback) {
  let body = []
  me.dummyData.forEach(function (item) {
    body.push({ index: { _id: item._id }})
    body.push(_.omit(item, ['_id']))
  })
  es.deleteByQuery({
    index: me.options.index,
    body: {
      query: {
        match_all: {}
      }
    }
  }, function(err, resp) {
    es.bulk({
      index: me.options.index,
      type: 'doc',
      refresh: 'true',
      body: body
    }, function (err, resp) {
      es.indices.refresh({
        index: me.options.index
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
  dummyData: [
    { _id: 'jack-bauer', name: 'Jack Bauer' },
    { _id: 'james-bond', name: 'James Bond' }
  ],
  timeout: 5000,
  resetDb: function (callback) {
    let me = this
    const es = new elasticsearch.Client(_.cloneDeep(me.options))
    es.indices.exists({
      index: me.options.index      
    }, function (err, resp) {
      if (resp) return recreate(me, es, callback)
      es.indices.create({
        index: me.options.index,
        body: mapping
      }, function (err, resp) {
        if (err) return callback(err)
        recreate(me, es, callback)
      })
    })
  }
}