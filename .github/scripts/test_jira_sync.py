"""Kiểm thử các hàm thuần của jira_sync.py. Chạy: python3 -m unittest discover -s .github/scripts"""
import os
import unittest
from unittest import mock

os.environ.setdefault('JIRA_URL', 'https://example.atlassian.net')
os.environ.setdefault('JIRA_USER', 'a@b.c')
os.environ.setdefault('JIRA_TOKEN', 'x')

import jira_sync as j  # noqa: E402


def pr_event(action, title='feat (PB-06)', body='', merged=False, draft=False):
    return {'action': action, 'pull_request': {'number': 5, 'title': title, 'body': body, 'html_url': 'https://x/pull/5', 'merged': merged, 'draft': draft, 'base': {'ref': 'staging'}}}


class Keys(unittest.TestCase):
    def test_nhan_ra_ma_scrum_va_pb(self):
        self.assertEqual(j.keys('feat (pb-6) và SCRUM-12, scrum-12'), ['PB-6', 'SCRUM-12'])

    def test_closing_chi_lay_ma_sau_tu_khoa(self):
        self.assertEqual(j.closing('Closes SCRUM-1, PB-02\nLiên quan: SCRUM-9'), {'SCRUM-1', 'PB-02'})
        self.assertEqual(j.closing('Liên quan SCRUM-9'), set())


class Plans(unittest.TestCase):
    def test_pr_mo_chuyen_in_review(self):
        self.assertEqual([(k, t) for k, t, *_ in j.plan_pull_request(pr_event('opened'))], [('PB-06', 'in review')])

    def test_pr_nhap_chi_in_progress(self):
        self.assertEqual(j.plan_pull_request(pr_event('opened', draft=True))[0][1], 'in progress')

    def test_pr_gop_co_closes_thi_done(self):
        plans = j.plan_pull_request(pr_event('closed', body='Closes PB-06\nRefs SCRUM-3', merged=True))
        self.assertEqual({k: t for k, t, *_ in plans}, {'PB-06': 'done', 'SCRUM-3': 'in progress'})

    def test_pr_dong_khong_gop_cho_phep_lui(self):
        plans = j.plan_pull_request(pr_event('closed'))
        self.assertEqual((plans[0][1], plans[0][2]), ('in progress', True))

    def test_push_chuyen_in_progress(self):
        plans = j.plan_push({'ref': 'refs/heads/Khoa', 'commits': [{'message': 'feat: x (SCRUM-4)'}, {'message': 'docs'}]})
        self.assertEqual([(k, t) for k, t, *_ in plans], [('SCRUM-4', 'in progress')])


class Move(unittest.TestCase):
    def fake(self, status, post_result):
        def call(method, path, body=None):
            if path.endswith('?fields=status'):
                return {'fields': {'status': {'name': status}}}
            if path.endswith('/transitions') and method == 'GET':
                return {'transitions': [{'id': '31', 'to': {'name': 'Done'}}, {'id': '21', 'to': {'name': 'In Review'}}]}
            if path.endswith('/transitions'):
                return post_result
            return {}

        return mock.patch.object(j, 'call', side_effect=call)

    def test_khong_lui_trang_thai(self):
        with self.fake('Done', {}) as m:
            j.move('SCRUM-1', 'in review', False, 'x')
        self.assertFalse(any(c.args[0] == 'POST' for c in m.call_args_list))

    def test_chuyen_thanh_cong_co_binh_luan(self):
        with self.fake('To Do', {}) as m:
            j.move('SCRUM-1', 'in review', False, 'x')
        self.assertEqual([c.args[1].rsplit('/', 1)[-1] for c in m.call_args_list if c.args[0] == 'POST'], ['transitions', 'comment'])

    def test_jira_loi_khong_binh_luan(self):
        with self.fake('To Do', None) as m:
            j.move('SCRUM-1', 'in review', False, 'x')
        self.assertEqual([c.args[1].rsplit('/', 1)[-1] for c in m.call_args_list if c.args[0] == 'POST'], ['transitions'])


if __name__ == '__main__':
    unittest.main()
