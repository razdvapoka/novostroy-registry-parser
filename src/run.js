import $ from 'cheerio'
import { MongoClient } from 'mongodb'
import axios from 'axios'
import co from 'co'

const mongoConnStr = `mongodb://localhost:27017/sro-registry`
const sroCollectionName = `sro`
const srosPageUrlTemplate = `http://reestr.nostroy.ru/?sort=u.registrationnumber&direction=ASC&page=`
const getSrosPageUrl = pageNum => `${srosPageUrlTemplate}${pageNum}`

const sroFieldTitles = {
    fullName: `Полное наименование:`,
    shortName: `Сокращенное наименование`,
    INN: `ИНН:`,
    OGRN: `ОГРН:`,
    district: `ОКРУГ:`,
    address: `Адрес местонахождения:`,
    phone: `Телефон:`,
    email: `E-mail:`,
    website: `Адрес сайта:`,
    collegialBoss: `Руководитель коллегиального органа СРО:`,
    executiveBoss: `Руководитель исполнительного органа СРО:`
}

const findRowValueByTitle = ($page, rows, title) => {
    try {
        const value =
        rows
        .filter((i, row) => $page(row)
            .find(`.field-title`)
            .text()
            .trim() === title)
        .find(`.field-data`)
        .text()
        .trim()
        return value
    } catch (err) {
        console.log(err)
        return null
    }
}

function getLastPageNumber($clientsPage) {
    const pageLinks = $clientsPage(`.pagination li a`).toArray()
    try {
        const lastPageLink = parseInt($clientsPage(pageLinks[pageLinks.length - 3]).text())
        return lastPageLink
    } catch (err) {
        console.log(err)
        return -1
    }
}

function* getSroData($sro) {
    try {
        const props = $sro.children().toArray()

        const sroData = {
            regId: $(props[0]).text(),
            status: $(props[4])
                .find(`:not(.glyphicon)`)
                .text()
                .trim()
        }

        const rel = $sro.attr(`rel`)
        const { data } = yield axios.get(`http://reestr.nostroy.ru${rel}`)
        const $clientPage = $.load(data)
        const rows = $clientPage(`.field-row`)
        Object.keys(sroFieldTitles).forEach(key => {
            sroData[key] = findRowValueByTitle($clientPage, rows, sroFieldTitles[key])
        })
        return sroData
    } catch (err) {
        console.log(err)
        return null
    }
}

function* parseSroPage(pageNum, sroCollection) {
    console.log(`Parsing SRO page #${pageNum}`)
    const { data } = yield axios.get(getSrosPageUrl(pageNum))
    const $srosPage = $.load(data)
    const sros = $srosPage(`.sro-link`).toArray()
    for (const i in sros) {
        const sroData = yield getSroData($srosPage(sros[i]))
        if (sroData) {
            yield sroCollection.save(sroData)
        }
    }
    console.log(`Finished parsing SRO page #${pageNum}`)
}

function* main() {
    const db = yield MongoClient.connect(mongoConnStr)
    const { data } = yield axios.get(getSrosPageUrl(1))
    const $firstPage = $.load(data)
    const lastPageNumber = getLastPageNumber($firstPage)
    for (let i = 1; i <= lastPageNumber; i++) {
        yield parseSroPage(i, db.collection(sroCollectionName))
    }
}

const run = () => co(main)

export default run
