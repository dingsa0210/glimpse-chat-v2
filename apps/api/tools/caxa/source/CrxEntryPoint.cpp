#include "stdafx.h"
#include "resource.h"
#include "crxdocman.h"
#include <float.h>
#include <math.h>
#include <string>

#define szRDS _RXST("")

static void WriteStatus(const CString& statusPath, const CString& value)
{
    if (statusPath.IsEmpty()) return;
    HANDLE file = ::CreateFile(statusPath, GENERIC_WRITE, FILE_SHARE_READ, NULL,
        CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
    if (file == INVALID_HANDLE_VALUE) return;
    CStringA utf8(CW2A(value, CP_UTF8));
    DWORD written = 0;
    ::WriteFile(file, utf8.GetString(), (DWORD)utf8.GetLength(), &written, NULL);
    ::CloseHandle(file);
}

struct SvgBounds
{
    double minX, minY, maxX, maxY;
    bool hasPoint;
    SvgBounds() : minX(DBL_MAX), minY(DBL_MAX), maxX(-DBL_MAX), maxY(-DBL_MAX), hasPoint(false) {}
    void Add(double x, double y) {
        if (!_finite(x) || !_finite(y)) return;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        hasPoint = true;
    }
};

static CStringA EscapeXml(const CxCHAR* value)
{
    CString wide(value ? value : L"");
    CString cleaned;
    for (int index = 0; index < wide.GetLength(); ++index) {
        wchar_t current = wide[index];
        if (current == L'\\' && index + 1 < wide.GetLength()) {
            wchar_t command = towupper(wide[index + 1]);
            if (command == L'P') { cleaned.AppendChar(L' '); ++index; continue; }
            if (wcschr(L"ACFHQSTW", command) != NULL) {
                int end = wide.Find(L';', index + 2);
                if (end >= 0) { index = end; continue; }
            }
        }
        if (current == L'{' || current == L'}') continue;
        cleaned.AppendChar((current == L'\r' || current == L'\n') ? L' ' : current);
    }
    cleaned.Replace(L"%%p", L"\u00B1"); cleaned.Replace(L"%%P", L"\u00B1");
    cleaned.Replace(L"%%d", L"\u00B0"); cleaned.Replace(L"%%D", L"\u00B0");
    cleaned.Replace(L"%%c", L"\u2300"); cleaned.Replace(L"%%C", L"\u2300");
    cleaned.Replace(L"%p", L"\u00B1"); cleaned.Replace(L"%P", L"\u00B1");
    cleaned.Replace(L"%d", L"\u00B0"); cleaned.Replace(L"%D", L"\u00B0");
    cleaned.Replace(L"%c", L"\u2300"); cleaned.Replace(L"%C", L"\u2300");
    CStringA escaped(CW2A(cleaned, CP_UTF8));
    escaped.Replace("&", "&amp;");
    escaped.Replace("<", "&lt;");
    escaped.Replace(">", "&gt;");
    escaped.Replace("\"", "&quot;");
    return escaped;
}

static void AppendSvgEntity(CRxDbEntity* entity, std::string& body, SvgBounds& bounds, int depth)
{
    if (entity == NULL || depth > 10) return;

    if (entity->isKindOf(CRxDbCurve::desc())) {
        CRxDbCurve* curve = CRxDbCurve::cast(entity);
        double start = 0.0, end = 0.0;
        if (curve == NULL || curve->getStartParam(start) != CDraft::eOk ||
            curve->getEndParam(end) != CDraft::eOk || !_finite(start) || !_finite(end)) return;

        int segments = 64;
        if (entity->isKindOf(CRxDbLine::desc())) segments = 1;
        else if (entity->isKindOf(CRxDbPolyline::desc())) segments = 96;
        else if (entity->isKindOf(CRxDbSpline::desc())) segments = 96;
        else if (entity->isKindOf(CRxDbCircle::desc())) segments = 96;

        CStringA points;
        int valid = 0;
        for (int index = 0; index <= segments; ++index) {
            double parameter = start + (end - start) * ((double)index / (double)segments);
            CRxGePoint3d point;
            if (curve->getPointAtParam(parameter, point) != CDraft::eOk) continue;
            double x = point.x, y = -point.y;
            if (!_finite(x) || !_finite(y)) continue;
            CStringA coordinate;
            coordinate.Format(valid == 0 ? "%.9g,%.9g" : " %.9g,%.9g", x, y);
            points += coordinate;
            bounds.Add(x, y);
            ++valid;
        }
        if (valid >= 2) {
            body += "<polyline points=\"";
            body += points.GetString();
            body += "\"/>\n";
        }
        return;
    }

    if (entity->isKindOf(CRxDbText::desc())) {
        CRxDbText* text = CRxDbText::cast(entity);
        CRxGePoint3d point = text->position();
        double x = point.x, y = -point.y;
        double height = fabs(text->height()); if (height <= 0.0) height = 2.5;
        double degrees = -text->rotation() * 180.0 / 3.14159265358979323846;
        CStringA line;
        line.Format("<text x=\"%.9g\" y=\"%.9g\" font-size=\"%.9g\" fill=\"#111\" stroke=\"none\" transform=\"rotate(%.9g %.9g %.9g)\">",
            x, y, height, degrees, x, y);
        body += line.GetString(); body += EscapeXml(text->textString()).GetString(); body += "</text>\n";
        bounds.Add(x, y); bounds.Add(x + height * 4.0, y + height);
        return;
    }

    if (entity->isKindOf(CRxDbMText::desc())) {
        CRxDbMText* text = CRxDbMText::cast(entity);
        CRxGePoint3d point = text->location();
        double x = point.x, y = -point.y;
        double height = fabs(text->textHeight()); if (height <= 0.0) height = 2.5;
        double degrees = -text->rotation() * 180.0 / 3.14159265358979323846;
        CStringA line;
        line.Format("<text x=\"%.9g\" y=\"%.9g\" font-size=\"%.9g\" fill=\"#111\" stroke=\"none\" transform=\"rotate(%.9g %.9g %.9g)\">",
            x, y, height, degrees, x, y);
        body += line.GetString(); body += EscapeXml(text->contents()).GetString(); body += "</text>\n";
        bounds.Add(x, y); bounds.Add(x + max(text->width(), height * 4.0), y + height);
        return;
    }

    if (entity->isKindOf(CRxDbBlockReference::desc())) {
        CRxDbVoidPtrArray exploded;
        if (entity->explode(exploded) == CDraft::eOk) {
            for (int index = 0; index < exploded.length(); ++index) {
                CRxDbEntity* part = static_cast<CRxDbEntity*>(exploded[index]);
                AppendSvgEntity(part, body, bounds, depth + 1);
                delete part;
            }
        }
        return;
    }

    // Complex entities are handled separately after the primary vector path is stable.
    // Calling explode() on vendor-specific dimension dictionaries can block indefinitely.
}

static bool WriteSvg(CRxDbDatabase* database, const CString& outputPath, const CString& statusPath, CString& summary)
{
    std::string body;
    body.reserve(32 * 1024 * 1024);
    SvgBounds bounds;
    int sourceEntities = 0;
    CRxDbBlockTable* blockTable = NULL;
    CRxDbBlockTableRecord* modelSpace = NULL;
    CRxDbBlockTableRecordIterator* iterator = NULL;
    if (database->getBlockTable(blockTable, CRxDb::kForRead) != CDraft::eOk || blockTable == NULL) return false;
    if (blockTable->getAt(ACDB_MODEL_SPACE, modelSpace, CRxDb::kForRead) != CDraft::eOk || modelSpace == NULL) {
        blockTable->close(); return false;
    }
    if (modelSpace->newIterator(iterator) != CDraft::eOk || iterator == NULL) {
        modelSpace->close(); blockTable->close(); return false;
    }
    for (; !iterator->done(); iterator->step()) {
        CRxDbEntity* entity = NULL;
        if (iterator->getEntity(entity, CRxDb::kForRead) == CDraft::eOk && entity != NULL) {
            AppendSvgEntity(entity, body, bounds, 0);
            entity->close();
            ++sourceEntities;
            if ((sourceEntities % 5000) == 0) {
                CString progress; progress.Format(L"svg-progress:%d", sourceEntities);
                WriteStatus(statusPath, progress);
            }
        }
    }
    delete iterator; modelSpace->close(); blockTable->close();
    if (!bounds.hasPoint || body.empty()) return false;

    double width = max(bounds.maxX - bounds.minX, 1.0);
    double height = max(bounds.maxY - bounds.minY, 1.0);
    double margin = max(width, height) * 0.015;
    double viewX = bounds.minX - margin, viewY = bounds.minY - margin;
    width += margin * 2.0; height += margin * 2.0;
    CStringA header;
    header.Format("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
        "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"%.12g %.12g %.12g %.12g\" "
        "preserveAspectRatio=\"xMidYMid meet\" shape-rendering=\"geometricPrecision\">\n"
        "<rect x=\"%.12g\" y=\"%.12g\" width=\"%.12g\" height=\"%.12g\" fill=\"white\"/>\n"
        "<g fill=\"none\" stroke=\"#111\" stroke-width=\"0.75\" vector-effect=\"non-scaling-stroke\" "
        "stroke-linecap=\"round\" stroke-linejoin=\"round\">\n",
        viewX, viewY, width, height, viewX, viewY, width, height);
    HANDLE file = ::CreateFile(outputPath, GENERIC_WRITE, FILE_SHARE_READ, NULL, CREATE_ALWAYS,
        FILE_ATTRIBUTE_NORMAL, NULL);
    if (file == INVALID_HANDLE_VALUE) return false;
    const char* footer = "</g>\n</svg>\n";
    DWORD headerWritten = 0, bodyWritten = 0, footerWritten = 0;
    BOOL ok = ::WriteFile(file, header.GetString(), (DWORD)header.GetLength(), &headerWritten, NULL);
    if (ok) ok = ::WriteFile(file, body.data(), (DWORD)body.size(), &bodyWritten, NULL);
    if (ok) ok = ::WriteFile(file, footer, (DWORD)strlen(footer), &footerWritten, NULL);
    ::CloseHandle(file);
    unsigned long totalWritten = (unsigned long)headerWritten + (unsigned long)bodyWritten + (unsigned long)footerWritten;
    summary.Format(L"svg:ok entities:%d bytes:%lu", sourceEntities, totalWritten);
    return ok && headerWritten == (DWORD)header.GetLength() && bodyWritten == (DWORD)body.size();
}

static void ConvertEnvironmentJob()
{
    wchar_t input[32768] = {0};
    wchar_t output[32768] = {0};
    wchar_t status[32768] = {0};
    if (!::GetEnvironmentVariable(L"GLIMPSE_CAXA_INPUT", input, _countof(input))) return;
    if (!::GetEnvironmentVariable(L"GLIMPSE_CAXA_OUTPUT", output, _countof(output))) return;
    ::GetEnvironmentVariable(L"GLIMPSE_CAXA_STATUS", status, _countof(status));

    CString statusPath(status);
    WriteStatus(statusPath, L"started");
    CRxDbDatabase* database = new CRxDbDatabase(CAXA::kFalse);
    CDraft::ErrorStatus readStatus = database->readExbFile(input);
    if (readStatus != CDraft::eOk) {
        CString message; message.Format(L"read-error:%d", (int)readStatus);
        WriteStatus(statusPath, message);
        delete database;
        return;
    }
    CString message;
    if (!WriteSvg(database, CString(output), statusPath, message)) message = L"svg:error";
    WriteStatus(statusPath, message);
    delete database;
}

static void CommandConvertEnvironmentJob()
{
    ConvertEnvironmentJob();
}

class CGlimpseDocumentReactor : public CRxApDocManagerReactor
{
public:
    CGlimpseDocumentReactor() : queued(false) {}

    virtual void documentActivated(CRxApDocument* document)
    {
        Queue(document);
    }

    virtual void documentBecameCurrent(CRxApDocument* document)
    {
        Queue(document);
    }

    void Queue(CRxApDocument* document)
    {
        if (queued || document == NULL || crxDocManager == NULL) return;
        queued = true;
        crxDocManager->sendStringToExecute(document, _T("GLIMPSECAXACONVERT\n"),
            true, false, false);
    }

private:
    bool queued;
};

static CGlimpseDocumentReactor* gDocumentReactor = NULL;

static void DeferredApplicationContextJob(void*)
{
    ConvertEnvironmentJob();
}

static DWORD WINAPI DeferredWorker(LPVOID)
{
    ::Sleep(5000);
    if (crxDocManager != NULL) {
        crxDocManager->executeInApplicationContext(&DeferredApplicationContextJob, NULL);
    }
    return 0;
}

class CGlimpseCaxaConverterApp : public AcRxArxApp
{
public:
    CGlimpseCaxaConverterApp() : AcRxArxApp() {}
    virtual AcRx::AppRetCode On_kInitAppMsg(void* pkt)
    {
        AcRx::AppRetCode result = AcRxArxApp::On_kInitAppMsg(pkt);
        crxedRegCmds->addCommand(_T("GLIMPSE_CAXA"), _T("GLIMPSECAXACONVERT"),
            _T("GLIMPSECAXACONVERT"), ACRX_CMD_MODAL, &CommandConvertEnvironmentJob);

        wchar_t status[32768] = {0};
        ::GetEnvironmentVariable(L"GLIMPSE_CAXA_STATUS", status, _countof(status));
        WriteStatus(CString(status), L"loaded");

        ConvertEnvironmentJob();

        // The database kernel is not ready while the CRX init callback is running.
        // Queue the conversion as an editor command so it runs after document startup.
        gDocumentReactor = new CGlimpseDocumentReactor();
        if (crxDocManager != NULL) {
            crxDocManager->addReactor(gDocumentReactor);
            gDocumentReactor->Queue(crxDocManager->mdiActiveDocument());
        }
        return result;
    }
    virtual AcRx::AppRetCode On_kLoadDwgMsg(void* pkt)
    {
        AcRx::AppRetCode result = AcRxArxApp::On_kLoadDwgMsg(pkt);
        wchar_t output[32768] = {0};
        wchar_t status[32768] = {0};
        if (!::GetEnvironmentVariable(L"GLIMPSE_CAXA_OUTPUT", output, _countof(output))) return result;
        ::GetEnvironmentVariable(L"GLIMPSE_CAXA_STATUS", status, _countof(status));
        CString statusPath(status);
        WriteStatus(statusPath, L"drawing-loaded");
        CRxDbDatabase* database = crxdbHostApplicationServices()->workingDatabase();
        if (database == NULL) {
            WriteStatus(statusPath, L"working-database-null");
            return result;
        }
        CDraft::ErrorStatus saveStatus = database->saveAs(output, true, CRxDb::kDHL_CURRENT);
        CString message; message.Format(L"save:%d", (int)saveStatus);
        WriteStatus(statusPath, message);
        return result;
    }
    virtual AcRx::AppRetCode On_kUnloadAppMsg(void* pkt)
    {
        if (gDocumentReactor != NULL) {
            if (crxDocManager != NULL) crxDocManager->removeReactor(gDocumentReactor);
            delete gDocumentReactor;
            gDocumentReactor = NULL;
        }
        crxedRegCmds->removeGroup(_T("GLIMPSE_CAXA"));
        return AcRxArxApp::On_kUnloadAppMsg(pkt);
    }
    virtual void RegisterServerComponents() {}
};

IMPLEMENT_ARX_ENTRYPOINT(CGlimpseCaxaConverterApp)
