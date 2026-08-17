-- B8: articles URL 제약을 (topic_id, url) 복합 UNIQUE로 변경
-- 기존: url 전역 unique → 동일 기사가 서로 다른 토픽에 중복 수집 불가 문제 해결

alter table articles drop constraint if exists articles_url_key;
alter table articles add constraint articles_topic_url_key unique (topic_id, url);
