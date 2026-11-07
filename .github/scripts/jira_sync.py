"""Đồng bộ trạng thái issue Jira theo hoạt động trên GitHub.

Issue được nhận ra bằng mã SCRUM-n hoặc mã backlog PB-nn (tìm theo nhãn pb-nn của issue) trong tiêu đề và mô tả PR hoặc thông điệp commit.
Quy tắc chuyển trạng thái, chỉ tiến lên, không lùi (trừ khi PR bị đưa về nháp hoặc đóng mà không gộp):
  PR mở hoặc sẵn sàng review        -> In Review
  PR chuyển về nháp, đóng không gộp -> In Progress (nếu đang In Review)
  PR được gộp                       -> Done nếu mô tả có "Closes SCRUM-n" hoặc "Closes PB-nn", ngược lại In Progress
  Commit đẩy lên nhánh cá nhân      -> In Progress (nếu đang To Do)
Chạy thử không gọi Jira: JIRA_DRY_RUN=1.
"""
import base64
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

RANK = {'to do': 0, 'in progress': 1, 'in review': 2, 'done': 3}
KEY = r'(?:SCRUM-\d+|PB-\d+)'
CLOSE = re.compile(r'\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?|done)\s*:?\s*((?:' + KEY + r'[\s,]*(?:and\s+)?)+)', re.I)
DRY = os.environ.get('JIRA_DRY_RUN') == '1'


def keys(text):
    return list(dict.fromkeys(k.upper() for k in re.findall(KEY, text or '', re.I)))


def closing(text):
    return {k for group in CLOSE.findall(text or '') for k in keys(group)}


def call(method, path, body=None):
    base = os.environ['JIRA_URL'].rstrip('/')
    auth = base64.b64encode(f"{os.environ['JIRA_USER']}:{os.environ['JIRA_TOKEN']}".encode()).decode()
    req = urllib.request.Request(
        base + path,
        method=method,
        data=None if body is None else json.dumps(body).encode(),
        headers={'Authorization': 'Basic ' + auth, 'Content-Type': 'application/json', 'Accept': 'application/json'},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        print(f'::warning::Jira {method} {path} trả {e.code}: {e.read()[:200]!r}')
    except (urllib.error.URLError, TimeoutError) as e:
        print(f'::warning::Không gọi được Jira: {e}')
    return None


def resolve(key):
    """SCRUM-n dùng luôn, PB-nn tìm issue có nhãn pb-nn."""
    if key.startswith('SCRUM-'):
        return key
    label = 'pb-%02d' % int(key.split('-')[1])
    if DRY:
        return f'(issue nhãn {label})'
    q = urllib.parse.urlencode({'jql': f'project = SCRUM AND labels = "{label}"', 'fields': 'status', 'maxResults': 1})
    res = call('GET', f'/rest/api/3/search/jql?{q}')
    issues = (res or {}).get('issues') or []
    return issues[0]['key'] if issues else None


def move(issue, target, allow_back, note):
    if DRY:
        print(f'[dry-run] {issue} -> {target} ({note})')
        return
    cur = ((call('GET', f'/rest/api/3/issue/{issue}?fields=status') or {}).get('fields') or {}).get('status', {}).get('name', '')
    cur_l = cur.lower()
    if cur_l not in RANK:
        print(f'{issue}: trạng thái "{cur}" không nằm trong quy trình, bỏ qua')
        return
    forward = RANK[target] > RANK[cur_l]
    back = allow_back and cur_l == 'in review' and target == 'in progress'
    if not (forward or back):
        print(f'{issue}: đang {cur}, không cần chuyển sang {target}')
        return
    trans = (call('GET', f'/rest/api/3/issue/{issue}/transitions') or {}).get('transitions', [])
    pick = next((t for t in trans if t['to']['name'].lower() == target), None)
    if not pick:
        print(f'::warning::{issue}: không có bước chuyển sang {target}')
        return
    if call('POST', f'/rest/api/3/issue/{issue}/transitions', {'transition': {'id': pick['id']}}) is None:
        print(f'::warning::{issue}: Jira không nhận lệnh chuyển sang {target}, không ghi bình luận')
        return
    text = f"{note} Trạng thái: {cur} -> {pick['to']['name']}."
    adf = {'type': 'doc', 'version': 1, 'content': [{'type': 'paragraph', 'content': [{'type': 'text', 'text': text}]}]}
    call('POST', f'/rest/api/3/issue/{issue}/comment', {'body': adf})
    print(f"{issue}: {cur} -> {pick['to']['name']}")


def plan_pull_request(ev):
    pr = ev['pull_request']
    action = os.environ.get('FORCE_ACTION') or ev['action']
    merged = pr.get('merged') or action == 'merged'
    text = f"{pr['title']}\n{pr.get('body') or ''}"
    ref = f"PR #{pr['number']} ({pr['html_url']})"
    if action in ('opened', 'reopened', 'ready_for_review'):
        target = 'in progress' if pr.get('draft') else 'in review'
        return [(k, target, False, f'{ref} đã mở.') for k in keys(text)]
    if action == 'converted_to_draft':
        return [(k, 'in progress', True, f'{ref} chuyển về nháp.') for k in keys(text)]
    if action in ('closed', 'merged') and merged:
        done = closing(text)
        return [(k, 'done' if k in done else 'in progress', False, f"{ref} đã gộp vào {pr['base']['ref']}.") for k in keys(text)]
    if action == 'closed':
        return [(k, 'in progress', True, f'{ref} đã đóng, chưa gộp.') for k in keys(text)]
    return []


def plan_push(ev):
    text = '\n'.join(c['message'] for c in ev.get('commits', []))
    branch = ev['ref'].split('/')[-1]
    return [(k, 'in progress', False, f"Có commit mới trên nhánh {branch}: {ev.get('compare', '')}") for k in keys(text)]


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    with open(os.environ['GITHUB_EVENT_PATH'], encoding='utf-8') as f:
        ev = json.load(f)
    name = os.environ['GITHUB_EVENT_NAME']
    plans = plan_pull_request(ev) if name == 'pull_request' else plan_push(ev) if name == 'push' else []
    seen = set()
    for key, target, back, note in plans:
        issue = resolve(key)
        if not issue:
            print(f'::warning::Không tìm thấy issue cho {key}')
        elif issue not in seen:
            seen.add(issue)
            move(issue, target, back, note)
    if not plans:
        print('Không có mã SCRUM hoặc PB nào để đồng bộ.')


if __name__ == '__main__':
    main()
