Component({
  properties: {
    event: {
      type: Object,
      value: {}
    }
  },

  methods: {
    onTap() {
      const event = this.data.event as { _id?: string }
      if (!event._id) return
      this.triggerEvent('select', { id: event._id })
    }
  }
})
