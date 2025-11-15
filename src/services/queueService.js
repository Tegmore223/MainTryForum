class QueueService {
  constructor() {
    this.queue = [];
    this.processing = false;
    setInterval(() => this.process(), 200);
  }

  add(job) {
    this.queue.push(job);
  }

  async process() {
    if (this.processing) return;
    this.processing = true;
    while (this.queue.length) {
      const job = this.queue.shift();
      try {
        await job();
      } catch (err) {
        console.error('Queue job failed', err);
      }
    }
    this.processing = false;
  }
}

module.exports = new QueueService();
