Component({
  properties: {
    event: {
      type: Object,
      value: {}
    },
    skeleton: {
      type: Boolean,
      value: false
    }
  },

  methods: {
    onTap() {
      const event = this.data.event as { _id?: string }
      if (!event._id || this.data.skeleton) return
      this.triggerEvent('select', { id: event._id })
    }
  }
})
