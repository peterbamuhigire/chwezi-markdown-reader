# Sanitisation attacks

<script>alert("script")</script>
<style>body { display: none }</style>
<iframe src="https://example.com"></iframe>
<object data="https://example.com"></object>
<embed src="https://example.com">
<form action="https://example.com"><input name="secret"></form>
<svg onload="alert('svg')"><script>alert("nested")</script></svg>

<p style="position:fixed" onclick="alert('attribute')">Safe text remains.</p>
<img src="missing.png" onerror="alert('image')" alt="Missing">

[JavaScript link](javascript:alert%281%29)
[HTML data link](data:text/html;base64,PHNjcmlwdD4=)
[Local file link](file:///etc/passwd)
[Safe web link](https://example.com/path)

![Inline PNG](data:image/png;base64,iVBORw0KGgo=)
