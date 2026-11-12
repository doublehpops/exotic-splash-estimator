-- Estimator survey questions. Not applied by the pull request that adds this file.
-- Old survey_answers values stay in the jsonb column. This file does not drop a column.
-- Nothing here sends a text.

create or replace function public.get_followup_survey(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_hash text;
  v public.job_followups%rowtype;
begin
  if p_token is null or p_token !~ '^s[A-Za-z0-9_-]{16}$' then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  v_hash := private.share_token_hash(p_token);
  select * into v from public.job_followups where survey_token_hash = v_hash;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if v.survey_used_at is not null then
    return jsonb_build_object('ok', false, 'code', 'used');
  end if;
  return jsonb_build_object(
    'ok', true,
    'questions', jsonb_build_array(
      jsonb_build_object('id','on_time','prompt','Did your estimator show up on time?','type','yes_no'),
      jsonb_build_object('id','explained','prompt','Did they clearly explain your options and pricing?','type','scale_1_5'),
      jsonb_build_object('id','professional','prompt','Were they professional and respectful of your home or business?','type','scale_1_5'),
      jsonb_build_object('id','likely','prompt','How likely are you to book with us?','type','yes_maybe_no'),
      jsonb_build_object('id','improve','prompt','Anything we could do better?','type','text')
    )
  );
end;
$function$;

create or replace function public.submit_followup_survey(p_token text, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_hash text;
  v public.job_followups%rowtype;
  v_on text;
  v_explained int;
  v_professional int;
  v_likely text;
  v_improve text;
  v_clean jsonb;
begin
  if p_token is null or p_token !~ '^s[A-Za-z0-9_-]{16}$' then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    return jsonb_build_object('ok', false, 'code', 'invalid', 'error', 'Please answer each question');
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_answers) k
    where k not in ('on_time','explained','professional','likely','improve')
  ) then
    return jsonb_build_object('ok', false, 'code', 'invalid', 'error', 'Unknown answer');
  end if;

  v_on := lower(btrim(coalesce(p_answers->>'on_time', '')));
  v_likely := lower(btrim(coalesce(p_answers->>'likely', '')));
  if v_on in ('y','true') then v_on := 'yes'; elsif v_on in ('n','false') then v_on := 'no'; end if;
  if v_likely in ('y','true') then v_likely := 'yes'; elsif v_likely in ('n','false') then v_likely := 'no'; elsif v_likely = 'm' then v_likely := 'maybe'; end if;
  if v_on not in ('yes','no') or v_likely not in ('yes','maybe','no') then
    return jsonb_build_object('ok', false, 'code', 'invalid', 'error', 'Please answer each question');
  end if;
  begin
    v_explained := (p_answers->>'explained')::int;
    v_professional := (p_answers->>'professional')::int;
  exception when others then
    return jsonb_build_object('ok', false, 'code', 'invalid', 'error', 'Please rate each score from 1 to 5');
  end;
  if v_explained is null or v_explained < 1 or v_explained > 5 then
    return jsonb_build_object('ok', false, 'code', 'invalid', 'error', 'Please rate the explanation from 1 to 5');
  end if;
  if v_professional is null or v_professional < 1 or v_professional > 5 then
    return jsonb_build_object('ok', false, 'code', 'invalid', 'error', 'Please rate professionalism from 1 to 5');
  end if;
  v_improve := left(btrim(coalesce(p_answers->>'improve', '')), 1000);
  v_clean := jsonb_build_object(
    'on_time', v_on,
    'explained', v_explained,
    'professional', v_professional,
    'likely', v_likely,
    'improve', v_improve
  );

  v_hash := private.share_token_hash(p_token);
  select * into v from public.job_followups where survey_token_hash = v_hash for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if v.survey_used_at is not null then
    return jsonb_build_object('ok', false, 'code', 'used');
  end if;

  update public.job_followups
     set survey_answers = v_clean,
         survey_used_at = now(),
         survey_token = null,
         status = case when status in ('sent','dry_run','sms_not_configured') then 'completed' else status end,
         updated_at = now()
   where id = v.id
     and survey_used_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'used');
  end if;
  return jsonb_build_object('ok', true);
end;
$function$;

revoke all on function public.get_followup_survey(text) from public, service_role;
revoke all on function public.submit_followup_survey(text, jsonb) from public, service_role;
grant execute on function public.get_followup_survey(text) to anon, authenticated;
grant execute on function public.submit_followup_survey(text, jsonb) to anon, authenticated;
