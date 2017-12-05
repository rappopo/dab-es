'use strict'

const elasticsearch = require('elasticsearch'),
  qbuilder = require('e3po')('client')._queryBuilder,
  Dab = require('@rappopo/dab')

class DabEs extends Dab {
  constructor (options) {
    super(options)
  }

  setOptions (options) {
    super.setOptions(this._.merge(this.options, {
      idSrc: '_id',
      idDest: options.idDest || options.idSrc || '_id',
      hosts: options.hosts || ['localhost:9200'],
      index: options.index || 'test',
      type: options.type || 'doc',
      apiVersion: options.apiVersion,
      options: options.options || {
        refresh: 'true'
      }
    }))
  }

  setClient (params) {
    if (this.client) return
    this.client = new elasticsearch.Client({
      hosts: this.options.hosts,
      apiVersion: this.options.apiVersion      
    })
  }

  find (params) {
    [params] = this.sanitize(params)
    this.setClient(params)
    let limit = params.limit || this.options.limit,
      skip = ((params.page || 1) - 1) * limit,
      sort = params.sort
    return new Promise((resolve, reject) => {
      let query = qbuilder({})
      query.bool.filter = qbuilder({ query: params.query || {} })

      this.client.search({
        index: params.index || this.options.index,
        type: params.type || this.options.type,
        body: { 
          query: query,
          from: skip,
          size: limit,
          sort: sort
        },
      })
      .then(result => {
        let data = { success: true, data: [] }
        result.hits.hits.forEach((d, i) => {
          data.data.push(this.convertDoc(this._.merge(d._source, { _id: d._id })))
        })
        resolve(data)
      })
      .catch(reject)
    })
  }

  _findOne (id, params, callback) {
    this.client.get({
      index: params.index || this.options.index,
      type: params.type || this.options.type,
      id: id
    })
    .then(result => {
      callback({
        success: true,
        data: this._.merge(result._source, { _id: result._id })
      })          
    })
    .catch(err => {
      if (err.statusCode === 404)
        err = new Error('Not found')
      callback({
        success: false,
        err: err
      })
    })
  }

  findOne (id, params) {
    [params] = this.sanitize(params)
    this.setClient(params)
    return new Promise((resolve, reject) => {
      this._findOne(id, params, result => {
        if (!result.success)
          return reject(result.err)
        let data = {
          success: true,
          data: this.convertDoc(result.data)
        }
        resolve(data)
      })
    })
  }

  _create (body, params, callback) {
    let opt = this._.merge(params.options || this.options.options, {
      index: params.index || this.options.index,
      type: params.type || this.options.type
    })
    if (body._id) opt.id = body._id
    opt.body = this._.omit(body, [this.options.idSrc])
    this.client.create(opt)
    .then(data => {
      this._findOne(data._id, this._.pick(opt, ['index', 'type']), result => {
        callback(result)
      })
    })
    .catch(err => {
      callback({
        success: false,
        err: err
      })
    })
  }

  create (body, params) {
    [params, body] = this.sanitize(params, body)
    this.setClient(params)
    return new Promise((resolve, reject) => {
      let id
      [body, id] = this.delFakeGetReal(body)
      if (id) {
        this._findOne(id, params, result => {
          if (result.success) 
            return reject(new Error('Exists'))
          this._create(body, params, result => {
            if (!result.success)
              return reject(result.err)
            result.data = this.convertDoc(result.data)
            resolve(result)
          })
        })
      } else {
        this._create(body, params, result => {
          if (!result.success)
            return reject(result.err)
          result.data = this.convertDoc(result.data)
          resolve(result)
        })        
      }
    })
  }

  update (id, body, params) {
    [params, body] = this.sanitize(params, body)
    this.setClient(params)
    body = this._.omit(body, [this.options.idDest || this.options.idSrc])
    return new Promise((resolve, reject) => {
      this._findOne(id, params, result => {
        if (!result.success)
          return reject(result.err)
        let source = result.data,
          method = 'update', 
          opt = this._.merge(params.options || this.options.options, {
            index: params.index || this.options.index,
            type: params.type || this.options.type,
            id: id
          })
        if (params.fullReplace) {
          opt.body = body
          method = 'index'
        } else {
          opt.body = { doc: this._.merge(this._.omit(result.data, [this.options.idSrc]), body) }
        }
        this.client[method](opt)
        .then(data => {
          this._findOne(id, this._.pick(opt, ['index', 'type']), result => {
            if (!result.success)
              return reject(result.err)
            let data = {
              success: true,
              data: this.convertDoc(result.data)
            }
            if (params.withSource)
              data.source = this.convertDoc(source)
            resolve(data)
          })
        })
        .catch(reject)
      })
    })
  }

  remove (id, params) {
    [params] = this.sanitize(params)
    this.setClient(params)
    return new Promise((resolve, reject) => {
      this._findOne(id, params, result => {
        if (!result.success)
          return reject(result.err)
        let source = result.data, 
          opt = this._.merge(params.options || this.options.options, {
            index: params.index || this.options.index,
            type: params.type || this.options.type,
            id: id
          })
        this.client.delete(opt)
        .then(result => {
          let data = { success: true }
          if (params.withSource)
            data.source = this.convertDoc(source)
          resolve(data)
        })
        .catch(reject)
      })
    })
  }

}

module.exports = DabEs