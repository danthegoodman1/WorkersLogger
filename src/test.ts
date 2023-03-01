import WorkerLogger from "."

async function test() {
  const logger = new WorkerLogger({
    withMeta: {
      hey: "ho"
    },
    metaInConsole: true
  })

  logger.info("this is a log", {
    more: "data"
  })
}

test()
