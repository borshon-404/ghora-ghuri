<?php
/* =============================================================================
   GHORA GHURI - example booking endpoint for shared hosting (PHP 8+, no composer)
   -----------------------------------------------------------------------------
   Drop this file at /api/index.php. Point .htaccess at it:
       RewriteEngine On
       RewriteCond %{REQUEST_FILENAME} !-f
       RewriteRule ^(.*)$ index.php [QSA,L]

   Same contract as api-example-node.js: GET /api/bookings (auth), POST /api/bookings,
   PUT /api/destinations (auth), GET /api/destinations. Data is stored as JSON files
   in ./store (chmod 700, outside the web root if you can). For anything beyond a
   few dozen enquiries a week, move to MySQL - the shape maps to one table.
   ========================================================================== */
declare(strict_types=1);

$STORE   = __DIR__ . '/store';
$ADMIN_USER = getenv('ADMIN_USER') ?: 'ghora-admin';
$ADMIN_HASH = getenv('ADMIN_HASH') ?: '';           // sha256("<user>:<pass>")
$SECRET   = getenv('SESSION_SECRET') ?: 'change-me-in-production';
$RECAPTCHA_SECRET = getenv('RECAPTCHA_SECRET') ?: '';
@mkdir($STORE, 0700, true);

header('Content-Type: application/json; charset=utf-8');
$origin = getenv('ALLOW_ORIGIN') ?: '';
header('Access-Control-Allow-Origin: ' . ($origin ?: '*'));
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Methods: GET,POST,PUT,OPTIONS');
header('X-Content-Type-Options: nosniff');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

$route = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$route = substr($route, strrpos($route, '/api/') !== false ? strlen(preg_replace('#.*/api#', '', $route)) + 4 : 0);
$method = $_SERVER['REQUEST_METHOD'];

function out(int $code, $data): void { http_response_code($code); echo json_encode($data, JSON_UNESCAPED_UNICODE); exit; }
function body(): array { $raw = file_get_contents('php://input'); $j = json_decode($raw, true); return is_array($j) ? $j : []; }
function readf(string $n, array $fallback = []): array { $p = $GLOBALS['STORE'] . '/' . $n; return is_file($p) ? (json_decode(file_get_contents($p), true) ?: $fallback) : $fallback; }
function writef(string $n, array $d): void { $p = $GLOBALS['STORE'] . '/' . $n; file_put_contents($p, json_encode($d, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), LOCK_EX); }

/* ----------------------------------------------------- token: HMAC(user:exp) */
function issue(): string { $exp = time() + 8 * 3600; return base64_encode((string)$exp) . '.' . hash_hmac('sha256', (string)$exp, $GLOBALS['SECRET']); }
function authed(): bool {
    $h = $_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
    if (!preg_match('/Bearer\s+(\S+)/', $h, $m)) return false;
    [$p, $sig] = array_pad(explode('.', $m[1]), 2, '');
    $exp = (int)base64_decode($p);
    return $exp > time() && hash_equals(hash_hmac('sha256', (string)$exp, $GLOBALS['SECRET']), $sig);
}

switch (true) {
    case $route === '/health':
        out(200, ['ok' => true, 'php' => PHP_VERSION, 'store' => is_writable($STORE)]);
        break;

    case $route === '/admin/login' && $method === 'POST':
        $b = body();
        $want = $ADMIN_HASH ?: hash('sha256', $ADMIN_USER . ':ChangeMe!2026');
        if (($b['user'] ?? '') !== $ADMIN_USER || hash('sha256', ($b['user'] ?? '') . ':' . ($b['pass'] ?? '')) !== $want) {
            usleep(400000);                       // slow down brute force
            out(401, ['error' => 'invalid credentials']);
        }
        out(200, ['token' => issue(), 'role' => 'admin', 'expires_in' => 8 * 3600]);
        break;

    case $route === '/bookings' && $method === 'GET':
        authed() or out(401, ['error' => 'unauthorized']);
        out(200, readf('bookings.json'));
        break;

    case $route === '/bookings' && $method === 'POST':
        $b = body();
        $errs = [];
        if (strlen(trim($b['name'] ?? '')) < 3) $errs['name'] = 'too short';
        if (!filter_var($b['email'] ?? '', FILTER_VALIDATE_EMAIL)) $errs['email'] = 'invalid';
        if (!preg_match('/^(\+?8801[3-9][0-9]{8}|01[3-9][0-9]{8})$/', preg_replace('/[\s\-()]/', '', $b['phone'] ?? ''))) $errs['phone'] = 'must be a BD mobile number';
        if ((int)($b['people_adults'] ?? 0) < 1) $errs['people_adults'] = 'at least 1 adult';
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $b['date_start'] ?? '')) $errs['date_start'] = 'expected Y-m-d';
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $b['date_end'] ?? '')) $errs['date_end'] = 'expected Y-m-d';
        if (($b['date_end'] ?? '') < ($b['date_start'] ?? '')) $errs['date_end'] = 'before start';
        if (empty($b['package']) && empty($b['destination'])) $errs['package'] = 'package or destination required';
        if (empty($b['consent'])) $errs['consent'] = 'required';
        if (!empty($b['_hp'])) out(200, ['ok' => true]);                     // bot field: swallow silently
        if ($RECAPTCHA_SECRET) {
            $ctx = stream_context_create(['http' => ['method' => 'POST', 'header' => "Content-Type: application/x-www-form-urlencoded\r\n",
                'content' => http_build_query(['secret' => $RECAPTCHA_SECRET, 'response' => $b['captchaToken'] ?? '']), 'timeout' => 5]]);
            $j = json_decode((string)@file_get_contents('https://www.google.com/recaptcha/api/siteverify', false, $ctx), true);
            if (empty($j['success']) || ($j['score'] ?? 0) < 0.5) $errs['captcha'] = 'human check failed';
        }
        if ($errs) out(422, ['ok' => false, 'errors' => $errs]);

        $pkgs = readf('packages.json');
        $dests = readf('destinations.json');
        $pkg = null; foreach ($pkgs as $p) if (($p['id'] ?? '') === ($b['package'] ?? '')) $pkg = $p;
        $days = max(1, (int)ceil((strtotime($b['date_end']) - strtotime($b['date_start'])) / 86400));
        $unit = $pkg['price_min'] ?? 3500;
        $head = (int)($b['people_adults'] ?: 1) + 0.7 * (int)($b['people_children'] ?: 0);
        $total = $unit * $days * $head * ($b['tour_type'] === 'private' ? 1.22 : 1);
        $total *= $head >= 12 ? 0.90 : ($head >= 6 ? 0.95 : 1);

        $rows = readf('bookings.json');
        $id = 'GG-' . date('Ymd') . '-' . str_pad((string)(count(array_filter($rows, fn($r) => strpos($r['id'] ?? '', 'GG-' . date('Ymd')) === 0)) + 1), 3, '0', STR_PAD_LEFT);
        array_unshift($rows, ['id' => $id, 'at' => date('c'), 'status' => 'new',
            'details' => array_map(fn($v) => is_string($v) ? mb_substr(preg_replace('/[\x00-\x1F\x7F]/u', ' ', $v), 0, 2000) : $v, $b),
            'quote' => ['total' => (int)round($total), 'days' => $days, 'head' => round($head, 1)]]);
        writef('bookings.json', array_slice($rows, 0, 4000));
        @mail('bookings@ghoraghuri.example', "New booking request $id",
              "$id\n{$b['name']} <{$b['email']}> {$b['phone']}\n{$b['date_start']} to {$b['date_end']}, " .
              round($head) . " pax\nEstimated BDT " . number_format((int)round($total)));
        out(201, ['ok' => true, 'id' => $id, 'quote' => ['total' => (int)round($total), 'days' => $days]]);
        break;

    case in_array($route, ['/destinations', '/packages'], true) && $method === 'GET':
        out(200, readf(ltrim($route, '/') . '.json'));
        break;

    case in_array($route, ['/destinations', '/packages'], true) && $method === 'PUT':
        authed() or out(401, ['error' => 'unauthorized']);
        $rows = body();
        if (!is_array($rows) || array_keys($rows) !== range(0, count($rows) - 1)) out(422, ['error' => 'expected a JSON array']);
        foreach ($rows as $i => $r) {
            if (empty($r['id']) || (empty($r['name']) && empty($r['title']))) out(422, ['error' => "record $i needs id and name/title"]);
        }
        writef(ltrim($route, '/') . '.json', $rows);
        out(200, ['ok' => true, 'written' => count($rows)]);
        break;

    default:
        out(404, ['error' => 'not found', 'route' => $route]);
}
