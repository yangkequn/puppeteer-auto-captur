FROM node:lts-bookworm AS base

RUN apt-get update \
	&& apt-get install -yq gconf-service libasound2 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgcc1 libgconf-2-4 libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 ca-certificates fonts-liberation libappindicator1 libnss3 lsb-release xdg-utils wget x11vnc x11-xkb-utils xfonts-100dpi xfonts-75dpi xfonts-scalable x11-apps xvfb

RUN apt-get update \
    && apt-get install -y wget gnupg \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 --no-install-recommends 
#安装中文字体 ttf-wqy*
RUN apt-get install -y ttf-wqy-zenhei --no-install-recommends

# 安装字体和fontconfig
RUN apt-get update && apt-get install -y \
    fontconfig \
    fonts-noto \
    fonts-liberation \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /home/chrome
RUN groupadd -r chrome && useradd -r -g chrome -G audio,video chrome
COPY main.js package.json yarn.lock /home/chrome
COPY local.conf /etc/fonts/local.conf
COPY local.conf /etc/fonts/conf.d/
#重新生成字体缓存，以确保新安装的字体和配置被正确识别。
RUN fc-cache -fv

RUN chown -R chrome:chrome /home/chrome
USER chrome

FROM base
RUN npm install
EXPOSE 5589
ENV DISPLAY :99
ENV CHROME_BIN /usr/bin/google-chrome
ENV DOCKER true
CMD Xvfb :99 -screen 0 1920x1080x16 & node main.js
