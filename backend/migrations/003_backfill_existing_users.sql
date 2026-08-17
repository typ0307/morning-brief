-- 기존 가입자 백필
-- 002_web_auth.sql의 트리거가 적용되기 전에 가입한 auth.users를
-- public.users로 채워 넣습니다 (재실행해도 안전).
insert into public.users (auth_user_id)
select u.id
from auth.users u
left join public.users p on p.auth_user_id = u.id
where p.id is null
on conflict (auth_user_id) do nothing;
