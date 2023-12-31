const { launch: puppeteerLaunch } = require('puppeteer-core')
const { launch, getStream } = require('puppeteer-stream')
const fs = require('fs')
const child_process = require('child_process')
const process = require('process')
const path = require('path')
const express = require('express')
const morgan = require('morgan')
require('express-async-errors')
require('console-stamp')(console, {
  format: ':date(yyyy/mm/dd HH:MM:ss.l)',
})

//const viewport = {  width: 1920,  height: 1080,}
//const viewport = { width: 1280, height: 720, }
const viewport = { width: 1400, height: 882 }
var currentBrowser, dataDir

const getCurrentBrowser = async () => {
  if (!currentBrowser || !currentBrowser?.isConnected()) {
    console.log('launching browser')
    currentBrowser = await launch(
      {
        launch: opts => {
          if (process.pkg) {
            opts.args = opts.args.filter(
              arg => !arg.startsWith('--load-extension=') && !arg.startsWith('--disable-extensions-except=')
            )
            opts.args = opts.args.concat([
              `--load-extension=${path.join(dataDir, 'extension')}`,
              `--disable-extensions-except=${path.join(dataDir, 'extension')}`,
              //后台标签保持活动状态
              '--disable-background-timer-throttling',
            ])
          }
          if (process.env.DOCKER || process.platform == 'win32') {
            opts.headless = false
            opts.args = opts.args.concat(['--no-sandbox'])
            opts.args = opts.args.concat(['--disable-setuid-sandbox'])
          }
          return puppeteerLaunch(opts)
        },
      },
      {
        executablePath: getExecutablePath(),
        defaultViewport: null, // no viewport emulation
        userDataDir: path.join(dataDir, 'chromedata'),
        args: [
          '--disable-notifications',
          '--no-first-run',
          '--disable-infobars',
          '--hide-crash-restore-bubble',
          '--disable-blink-features=AutomationControlled',
          '--hide-scrollbars',
          //后台标签保持活动状态
          '--disable-background-timer-throttling',
        ],
        ignoreDefaultArgs: [
          '--enable-automation',
          '--disable-extensions',
          '--disable-default-apps',
          '--disable-component-update',
          '--disable-component-extensions-with-background-pages',
          '--enable-blink-features=IdleDetection',
        ],
      }
    )
    currentBrowser.on('close', () => {
      console.log('browser closed')
      currentBrowser = null
    })
  } else {
    //write log
    console.log('browser is connected');
  }
  //if there's over 10 pages, close the first ones to avoid memory leak
  let pages = await currentBrowser.pages()
  if (pages.length > 10) {
    pages.slice(0, pages.length - 10).forEach(page => page.close())
    //write log
    console.log('close pages', pages.length - 10);
  }
  return currentBrowser
}

const getExecutablePath = () => {
  if (process.env.CHROME_BIN) {
    return process.env.CHROME_BIN
  }

  let executablePath
  if (process.platform === 'linux') {
    try {
      executablePath = child_process.execSync('which chromium-browser').toString().split('\n').shift()
    } catch (e) {
      // NOOP
    }

    if (!executablePath) {
      executablePath = child_process.execSync('which chromium').toString().split('\n').shift()
      if (!executablePath) {
        throw new Error('Chromium not found (which chromium)')
      }
    }
  } else if (process.platform === 'darwin') {
    executablePath = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    ].find(fs.existsSync)
  } else if (process.platform === 'win32') {
    executablePath = [
      `C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe`,
      `C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe`,
      path.join(process.env.USERPROFILE, 'AppData', 'Local', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(process.env.USERPROFILE, 'AppData', 'Local', 'Chromium', 'Application', 'chrome.exe'),
    ].find(fs.existsSync)
  } else {
    throw new Error('Unsupported platform: ' + process.platform)
  }

  return executablePath
}

async function main() {
  dataDir = process.cwd()
  if (process.pkg) {
    switch (process.platform) {
      case 'darwin':
        dataDir = path.join(process.env.HOME, 'Library', 'Application Support', 'ChromeCapture')
        break
      case 'win32':
        dataDir = path.join(process.env.USERPROFILE, 'AppData', 'Local', 'ChromeCapture')
        break
    }
    let out = path.join(dataDir, 'extension')
    fs.mkdirSync(out, { recursive: true })
      ;['manifest.json', 'background.js', 'options.html', 'options.js'].forEach(file => {
        fs.copyFileSync(
          path.join(process.pkg.entrypoint, '..', 'node_modules', 'puppeteer-stream', 'extension', file),
          path.join(out, file)
        )
      })
  }

  const app = express()

  const df = require('dateformat')
  morgan.token('mydate', function (req) {
    return df(new Date(), 'yyyy/mm/dd HH:MM:ss.l')
  })
  app.use(morgan('[:mydate] :method :url from :remote-addr responded :status in :response-time ms'))

  app.get('/', (req, res) => {
    res.send(
      `<html>
  <title>Chrome Capture for Channels</title>
  <h2>Chrome Capture for Channels</h2>
  <p>Usage: <code>/stream?url=URL</code> or <code>/stream/&lt;name></code></p>
  <pre>
  #EXTM3U

  #EXTINF:-1 channel-id="windy",Windy
  chrome://${req.get('host')}/stream/windy

  #EXTINF:-1 channel-id="weatherscan",Weatherscan
  chrome://${req.get('host')}/stream/weatherscan
  </pre>
  </html>`
    )
  })

  app.get('/debug', async (req, res) => {
    res.send(`<html>
    <script>
    async function videoClick(e) {
      e.target.focus()
      let x = ((e.clientX-e.target.offsetLeft) * e.target.videoWidth)/e.target.clientWidth
      let y = ((e.clientY-e.target.offsetTop) * e.target.videoHeight)/e.target.clientHeight
      console.log('video click', x, y)
      await fetch('/debug/click/'+x+'/'+y)
    }
    async function videoKeyPress(e) {
      console.log('video keypress', e.key)
      await fetch('/debug/keypress/'+e.key)
    }
    document.addEventListener('keypress', videoKeyPress)
    </script>
    <video style="width: 100%; height: 100%" onKeyPress="videoKeyPress(event)" onClick="videoClick(event)" src="/stream?waitForVideo=false&url=${encodeURIComponent(
      req.query.url || 'https://google.com'
    )}" autoplay muted />
    </html>`)
  })

  app.get('/debug/click/:x/:y', async (req, res) => {
    let browser = await getCurrentBrowser()
    let pages = await browser.pages()
    if (pages.length == 0) {
      res.send('false')
      return
    }
    let page = pages[pages.length - 1]
    await page.mouse.click(parseInt(req.params.x), parseInt(req.params.y))
    res.send('true')
  })

  app.get('/debug/keypress/:key', async (req, res) => {
    let browser = await getCurrentBrowser()
    let pages = await browser.pages()
    if (pages.length == 0) {
      res.send('false')
      return
    }
    let page = pages[pages.length - 1]
    await page.keyboard.press(req.params.key)
    res.send('true')
  })

  app.get('/stream.webm/:name?', async (req, res) => {
    var url = req.query.url
    var play = req.query.play

    // Set the response headers to stream the video
    if (play == 'true') {
      res.setHeader('Content-Type', 'video/webm')
      res.setHeader('Transfer-Encoding', 'chunked')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')
    }



    var browser, page
    try {
      browser = await getCurrentBrowser();
      //await page.setBypassCSP(true)
      //page.on('console', msg => console.log(msg.text()))
    } catch (e) {
      console.log('failed to getCurrentBrowser', url, e);
      res.status(500).send(`failed to getCurrentBrowser: ${e}`);
      return;
    }
    try {
      page = await browser.newPage();
      await page.setBypassCSP(true)
      //page.on('console', msg => console.log(msg.text()))
    } catch (e) {
      console.log('failed to start newPage', url, e);
      res.status(500).send(`failed to start newPage: ${e}`);
      //close current page
      await page.close();
      return;
    }
    //resize page to viewport size,full screen
    await page.setViewport(viewport);

    //set local storage jwt to `{"sub":"Kequn","jwt":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3MDMwMzMxNjgsImlhdCI6MTcwMDQ0MTE2OCwiaWQiOjc3NTU0MTE5Njc3MDEyNTQsInB1YiI6Nzc1NTU2Mzk0OTUzNjQ3MSwic3ViIjoiS2VxdW4iLCJ0ZW1wb3JhcnlBY2NvdW50IjpmYWxzZX0.9DtAiRKDiaBgudYhaRCEY8fa8xXH5rs51hvDrspKtPo","id":7755411967701254,"pub":7755563949536471,"temporaryAccount":false}`
    try {
      await page.goto(url);

      //if os in not mac os
      if (process.platform !== 'darwin') {
        await page.evaluate(() => {
          // You can set key-value pairs in localStorage like this
          localStorage.setItem('jwt', '{"sub":"Kequn","jwt":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3MDMwMzMxNjgsImlhdCI6MTcwMDQ0MTE2OCwiaWQiOjc3NTU0MTE5Njc3MDEyNTQsInB1YiI6Nzc1NTU2Mzk0OTUzNjQ3MSwic3ViIjoiS2VxdW4iLCJ0ZW1wb3JhcnlBY2NvdW50IjpmYWxzZX0.9DtAiRKDiaBgudYhaRCEY8fa8xXH5rs51hvDrspKtPo","id":7755411967701254,"pub":7755563949536471,"temporaryAccount":false}');
          localStorage.setItem('Authorization', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3MDMwMzMxNjgsImlhdCI6MTcwMDQ0MTE2OCwiaWQiOjc3NTU0MTE5Njc3MDEyNTQsInB1YiI6Nzc1NTU2Mzk0OTUzNjQ3MSwic3ViIjoiS2VxdW4iLCJ0ZW1wb3JhcnlBY2NvdW50IjpmYWxzZX0.9DtAiRKDiaBgudYhaRCEY8fa8xXH5rs51hvDrspKtPo');
        });
        //refresh page
        await page.reload();
      }

    } catch (e) {
      console.log('failed to stream', url, e);
    }
    //listen to StopRecording event of the page, and close the page when it's fired
    page.on('console', async msg => {
      if (msg.text() === 'AutoPlayEnd') {
        await page.close()
      }
    })
    // Wait for 3 seconds
    // wait untile  window.AutoPlayStart is true    
    var now = new Date().getTime();
    await page.waitForFunction('window.AutoPlayStart === true', { timeout: 10000 })
    //if timeout  ,close page and return
    if (new Date().getTime() - now > 9000) {
      await page.close();
      res.status(500).send(`failed to start stream: timeout`);
      return;
    }


    try {
      const stream = await getStream(page, {
        video: true,
        audio: true,
        videoBitsPerSecond: 8000000,
        audioBitsPerSecond: 192000,
        mimeType: 'video/webm;codecs=H264',
        videoConstraints: {
          mandatory: {
            minWidth: viewport.width,
            minHeight: viewport.height,
            maxWidth: viewport.width,
            maxHeight: viewport.height,
            minFrameRate: 60,
          },
        },
      })

      console.log('streaming', url)

      stream.pipe(res)
      res.on('close', async err => {
        await stream.destroy()
        //page closed already by StopRecording event
        //await page.close()
        console.log('res close finished', url)
      })
    } catch (e) {
      console.log('failed to start stream', url, e)
      res.status(500).send(`failed to start stream: ${e}`)
      //page closed already by StopRecording event
      //await page.close()
      return
    }

    try {
      const uiSize = await page.evaluate(`(function() {
        return {
          height: window.outerHeight - window.innerHeight,
          width: window.outerWidth - window.innerWidth,
        }
      })()`)
      const session = await page.target().createCDPSession()
      const { windowId } = await session.send('Browser.getWindowForTarget')
      await session.send('Browser.setWindowBounds', {
        windowId,
        bounds: {
          height: viewport.height + uiSize.height,
          width: viewport.width + uiSize.width,
        },
      })
    } catch (e) {
      console.log('failed to stream', url, e)
    }
  })

  const server = app.listen(5589, () => {
    console.log('Chrome Capture server listening on port 5589')
  })
}

main()
