insert into system_settings (setting_key, boolean_value)
values ('audio_transcription.enabled', false)
on conflict (setting_key) do nothing;
